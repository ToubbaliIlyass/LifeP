import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { aiConfigured, structuredModel, isFreeModel } from '@/lib/ai/client'
import { clockIn, zoneFor } from '@/lib/clock'
import { readSettings } from '@/lib/settings'
import { recordUsage } from '@/lib/ai/usage'
import { fallbackIdentities } from '@/lib/identity-speech'
import { logger } from '@/lib/log'

const HearSchema = z.object({
  identities: z.array(z.object({
    name: z.string().describe('Finishes "I’m becoming …": "a runner", "someone who writes". Lower case, short, no "I am".'),
  })),
})

/**
 * Say who you are becoming, out loud, and get back the names to confirm.
 *
 * The model only reads the sentence; nothing is written here. The screen
 * shows what was heard and the user taps to accept, so a misheard word
 * costs a tap rather than a wrong identity. Body: { text, tz? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { text?: unknown; tz?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1500) : ''
  if (!text) return Response.json({ error: 'Nothing heard' }, { status: 400 })

  let names: string[]
  try {
    if (!aiConfigured()) throw new Error('OPENAI_API_KEY is not set')
    const settings = await readSettings(user.id)
    const clock = clockIn(zoneFor(typeof body.tz === 'string' ? body.tz : null, settings.timeZone, settings.timeZoneOverride))
    const { output, usage, response } = await generateText({
      model: structuredModel,
      system: [
        'Someone is saying out loud who they want to become, or what they are working toward.',
        'List each person they are becoming as a short noun phrase that finishes "I’m becoming …": "a runner", "someone who writes", "calm", "a good friend".',
        'A goal such as "run a marathon" or "write a book" becomes the person it makes: "a runner", "a writer".',
        'Use their own words where you can. One entry per distinct identity; at most five; invent nothing they did not say.',
        'If they said nothing about who they are or want to be, return an empty list.',
      ].join('\n'),
      prompt: text,
      output: Output.object({ schema: HearSchema }),
      providerOptions: { openai: { promptCacheKey: `acture-identity-hear-${user.id}` } },
      maxOutputTokens: 300,
    })
    void recordUsage(user.id, isFreeModel(response.modelId) ? { ...usage, free: true } : usage, 'identity-hear', clock.date)
    names = output.identities.map((i) => i.name)
  } catch (error) {
    logger.warn('identity_hear_failed', { message: error instanceof Error ? error.message : String(error) })
    names = fallbackIdentities(text)
  }

  const seen = new Set<string>()
  const clean = names
    .map((n) => n.trim().replace(/^i['’]?m becoming\s+/i, '').replace(/[.!,]+$/, '').slice(0, 80))
    .filter((n) => n && !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()))
    .slice(0, 5)
  return Response.json({ names: clean })
}
