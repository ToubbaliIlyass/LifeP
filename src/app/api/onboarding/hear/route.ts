import { generateText, Output } from 'ai'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { aiConfigured, structuredModel, isFreeModel } from '@/lib/ai/client'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { recordUsage } from '@/lib/ai/usage'
import { logger } from '@/lib/log'
import { cleanWeek, cleanWhen, cleanWho, STEPS, WeekSchema, WhenSchema, WhoSchema, type Step } from '@/lib/onboarding-speech'

const BRIEF: Record<Step, string> = {
  week: 'They are saying what is fixed in their week: classes, shifts, training, anything at the same time every week. List each as a name, the days, a start time and how long.',
  who: 'They are saying who they want to become, or what they are working toward. List each as a short noun phrase that finishes "I’m becoming …": "a runner", "someone who writes", "calm". A goal such as "run a marathon" becomes the person it makes: "a runner".',
  when: 'They are saying when they like to do things, so a planner can place them. "prefer" = they like to do an activity at that time ("I work out in the morning"). "busy" = nothing should be planned then ("I never work after 10pm"; a day or time kept for family, rest, church or "off" — "Sundays are family time" is busy, days [0], 00:00–23:59). "free" = a good time for anything. Morning is 06:00–12:00, afternoon 12:00–17:00, evening 17:00–22:00 unless they name hours.',
}

/**
 * Setup by voice: the current list plus one more thing said, and back comes
 * the whole list as it should now be. Adding ("and I have a lab on
 * Thursday"), correcting ("make that 11") and removing ("forget the gym")
 * are all the same request, so the user never has to find a field to fix one.
 *
 * Nothing is written here; the screen shows the list and saves it on Next.
 * Body: { step, text, current, tz? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { step?: unknown; text?: unknown; current?: unknown; tz?: unknown }
  const step = STEPS.find((s) => s === body.step)
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1500) : ''
  if (!step || !text) return Response.json({ error: 'Nothing heard' }, { status: 400 })
  const current = Array.isArray(body.current) ? body.current.slice(0, 20) : []

  if (!aiConfigured()) return Response.json({ error: 'Listening needs the assistant, which is not set up.' }, { status: 503 })

  try {
    const settings = await readSettings(user.id)
    const clock = clockIn(zoneFor(typeof body.tz === 'string' ? body.tz : null, settings.timeZone, settings.timeZoneOverride))
    const common = {
      model: structuredModel,
      system: [
        BRIEF[step],
        'You are given the list so far and what they just said. Return the whole list as it should be now: keep what is still right, add what is new, change what they corrected, remove what they took back.',
        'Invent nothing they did not say. If what they said has nothing to do with the question, return the list unchanged.',
        `Local time ${clock.date}.`,
      ].join('\n'),
      prompt: `List so far: ${JSON.stringify(current)}\nThey said: ${text}`,
      providerOptions: { openai: { promptCacheKey: `acture-onboarding-${step}-${user.id}` } },
      maxOutputTokens: 900,
    }
    let items: unknown[]
    let result
    if (step === 'week') {
      result = await generateText({ ...common, output: Output.object({ schema: WeekSchema }) })
      items = cleanWeek(result.output.items.map((i) => ({ name: i.name, days: i.days, time: i.time, minutes: i.minutes ?? undefined })))
    } else if (step === 'who') {
      result = await generateText({ ...common, output: Output.object({ schema: WhoSchema }) })
      items = cleanWho(result.output.items)
    } else {
      result = await generateText({ ...common, output: Output.object({ schema: WhenSchema }) })
      items = cleanWhen(result.output.items.map((i) => ({ ...i, activity: i.activity ?? '' })))
    }
    void recordUsage(user.id, isFreeModel(result.response.modelId) ? { ...result.usage, free: true } : result.usage, 'onboarding-hear', clock.date)
    return Response.json({ items })
  } catch (error) {
    logger.warn('onboarding_hear_failed', { message: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: 'I couldn’t read that. Try saying it again.' }, { status: 502 })
  }
}
