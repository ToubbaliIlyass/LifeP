import { generateText, Output } from 'ai'
import { z } from 'zod'
import { defaultModel } from '@/lib/ai/client'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { listMemories, normaliseMemory, MEMORY_CATEGORIES } from '@/lib/memory'
import { logger } from '@/lib/log'

/**
 * Turns a chatbot history into candidate memories. Saves NOTHING — the
 * candidates go back to the browser, the user ticks the ones that are right,
 * and only those are written (POST /api/memory).
 *
 * The browser has already unpacked the export and reduced it to the user's
 * own messages (src/lib/chat-export.ts), so what arrives here is a bounded
 * digest, never the raw multi-megabyte file.
 */

/** Hard cap on what one import may cost. The client trims to this too. */
const MAX_CHARS = 80_000
const CHUNK_CHARS = 16_000

const Extracted = z.object({
  memories: z.array(
    z.object({
      text: z.string().describe('One short third-person sentence, e.g. "Trains at the gym on weekday evenings"'),
      category: z.enum(MEMORY_CATEGORIES),
    }),
  ),
})

const SYSTEM = `You read a person's own messages to an AI chatbot (or a summary a chatbot wrote about them) and pull out durable facts that a personal life-planning app should know about them.

Keep:
- goals and ambitions; ongoing projects (and what they are)
- routines and schedule: work or school hours, when they train, sleep, commute, recurring commitments
- preferences about how and when they like to work
- constraints: location, health limits relevant to planning, caring duties, budget limits
- content they create, courses they take, tools they rely on

Drop:
- one-off questions and tasks with no lasting personal detail (debugging this error, explain this concept)
- private details about other people
- passwords, keys, account numbers, addresses, exact financial figures
- medical detail beyond what matters for scheduling

Rules: one short third-person sentence per memory. Merge duplicates. When excerpts conflict, prefer the more recent one (excerpts are ordered newest first). At most 25 memories per excerpt. If nothing qualifies, return an empty list.`

function chunk(text: string): string[] {
  const out: string[] = []
  let current = ''
  // Split on conversation boundaries so no conversation is cut mid-thought.
  for (const section of text.split(/\n(?=### )/)) {
    if (current && current.length + section.length > CHUNK_CHARS) {
      out.push(current)
      current = ''
    }
    current += (current ? '\n' : '') + section.slice(0, CHUNK_CHARS)
  }
  if (current) out.push(current)
  return out
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY is not set.' }, { status: 503 })
  }
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as { text?: unknown }
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return Response.json({ error: 'Nothing to import' }, { status: 400 })
  }
  const truncated = body.text.length > MAX_CHARS
  const chunks = chunk(body.text.slice(0, MAX_CHARS))

  const results = await Promise.all(
    chunks.map(async (prompt) => {
      try {
        const { output } = await generateText({
          model: defaultModel,
          system: SYSTEM,
          prompt,
          output: Output.object({ schema: Extracted }),
        })
        return output.memories
      } catch (err) {
        logger.info('memory_import_chunk_failed', { error: String(err) })
        return []
      }
    }),
  )

  const existing = new Set((await listMemories(user.id)).map((m) => normaliseMemory(m.text)))
  const seen = new Set<string>()
  const candidates = results.flat().filter((m) => {
    const key = normaliseMemory(m.text)
    if (!key || seen.has(key) || existing.has(key)) return false
    seen.add(key)
    return true
  })

  return Response.json({ candidates, truncated, chunks: chunks.length })
}
