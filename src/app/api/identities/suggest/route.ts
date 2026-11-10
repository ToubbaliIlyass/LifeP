import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { aiConfigured, structuredModel, isFreeModel } from '@/lib/ai/client'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { recordUsage } from '@/lib/ai/usage'
import { logger } from '@/lib/log'
import { identityMaterial } from '@/lib/identity-match'
import { getNodes } from '@/lib/graph/queries'
import { identityOf } from '@/lib/identity'

const SuggestSchema = z.object({
  items: z.array(z.object({
    name: z.string().describe('Finishes "I’m becoming …": "a runner", "someone who writes", "a good student". Lower case, short.'),
    listIds: z.array(z.number()).describe('ids of the areas or projects that are this person’s work'),
    itemIds: z.array(z.number()).describe('ids of the to-dos that belong to them'),
    tags: z.array(z.string()).describe('tags that belong to them, exactly as given'),
  })),
})

/**
 * Who your to-dos already say you are.
 *
 * The model is shown what the user actually has — their areas, projects,
 * to-dos, tags and what they finished lately — and proposes the people those
 * add up to, each with the things that count toward it. It only reads: every
 * id it hands back is checked against what was sent, so it cannot attach
 * something that is not theirs, and nothing is written here. The panel shows
 * them as suggestions to add or leave.
 *
 * Body: { lists: {id,title,kind}[], items: {id,title}[], tags: string[], done: string[], existing: string[] }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!aiConfigured()) return Response.json({ suggestions: [] })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const arr = <T,>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : [])
  // Called with nothing (setup, before the screen has loaded their lists): read them here.
  if (!Array.isArray(body.lists) && !Array.isArray(body.items)) {
    const material = await identityMaterial(user.id)
    body.lists = material.lists
    body.items = material.items
    body.tags = material.tags
    body.existing = (await getNodes(user.id, { type: 'Identity' })).map((n) => identityOf(n).name)
  }
  const lists = arr<{ id: number; title: string; kind: string }>(body.lists, 60).filter((l) => Number.isInteger(l?.id) && typeof l.title === 'string' && l.title.trim())
  const items = arr<{ id: number; title: string }>(body.items, 60).filter((h) => Number.isInteger(h?.id) && typeof h.title === 'string' && h.title.trim())
  const tags = arr<string>(body.tags, 60).filter((t) => typeof t === 'string' && t.trim())
  const done = arr<string>(body.done, 40).filter((t) => typeof t === 'string' && t.trim())
  const existing = arr<string>(body.existing, 20).filter((t) => typeof t === 'string')
  if (!lists.length && !items.length && !tags.length && !done.length) return Response.json({ suggestions: [] })

  try {
    const settings = await readSettings(user.id)
    const clock = clockIn(zoneFor(null, settings.timeZone, settings.timeZoneOverride))
    const { output, usage, response } = await generateText({
      model: structuredModel,
      system: [
        'You read someone’s to-do system and say who it shows them becoming.',
        'Propose up to 5 identities, each a short noun phrase that finishes "I’m becoming …": "a runner", "someone who writes", "a good student". Use the themes that really show up in their areas, projects, to-dos, tags and finished to-dos.',
        'For each, list the area/project ids, to-do ids and tags that are that person’s work, using only the ids and tags given. Every identity needs at least one.',
        'Skip anything generic (admin, errands, chores) unless it is a clear theme. Never repeat an identity they already have. Invent nothing the data does not support.',
      ].join('\n'),
      prompt: JSON.stringify({ areasAndProjects: lists, todos: items, tags, recentlyFinished: done, alreadyHave: existing }),
      output: Output.object({ schema: SuggestSchema }),
      providerOptions: { openai: { promptCacheKey: `acture-identity-suggest-${user.id}` } },
      maxOutputTokens: 700,
    })
    void recordUsage(user.id, isFreeModel(response.modelId) ? { ...usage, free: true } : usage, 'identity-suggest', clock.date)

    const listOk = new Set(lists.map((l) => l.id))
    const itemOk = new Set(items.map((h) => h.id))
    const tagByLower = new Map(tags.map((t) => [t.toLowerCase(), t]))
    const have = new Set(existing.map((e) => e.toLowerCase().trim()))
    const seen = new Set<string>()
    const suggestions = output.items
      .map((i) => ({
        name: i.name.trim().replace(/^i['’]?m becoming\s+/i, '').replace(/[.!,]+$/, '').slice(0, 80),
        listIds: [...new Set(i.listIds.filter((id) => listOk.has(id)))],
        itemIds: [...new Set(i.itemIds.filter((id) => itemOk.has(id)))],
        tags: [...new Set(i.tags.map((t) => tagByLower.get(t.toLowerCase())).filter((t): t is string => !!t))],
      }))
      .filter((s) => s.name && !have.has(s.name.toLowerCase()) && !seen.has(s.name.toLowerCase()) && !!seen.add(s.name.toLowerCase()))
      .filter((s) => s.listIds.length + s.itemIds.length + s.tags.length > 0)
      .slice(0, 5)
    return Response.json({ suggestions })
  } catch (error) {
    logger.warn('identity_suggest_failed', { message: error instanceof Error ? error.message : String(error) })
    return Response.json({ suggestions: [] })
  }
}
