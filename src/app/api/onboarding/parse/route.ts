import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { defaultModel } from '@/lib/ai/client'
import { todayStr } from '@/lib/date'

/**
 * Setup, spoken.
 *
 * The forms ask for things people cannot say in the shape of a field. "I have
 * class Monday and Wednesday two till four, work Thursday evenings, and I
 * train most mornings before anything else" is one breath and three rows with
 * eleven values in them, and typing it out is the part of setup people
 * abandon. So they say it, and this turns the sentence into the rows.
 *
 * What it does NOT do is write anything. It answers with drafts, the client
 * drops them into the same fields the user would have filled in themselves,
 * and nothing reaches the database until they press Finish — so a misheard
 * "ten" for "two" is a visible wrong number in a box they are already
 * looking at, not a wrong class on next week's calendar.
 *
 * One section at a time, because a schema that only describes habits cannot
 * answer with a goal, and a small schema is a far more accurate one than a
 * single schema for the whole interview.
 */

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const DAYS = z.array(z.number().int().min(0).max(6)).max(7)

const SECTIONS = {
  /** Waking hours, and the named stretches the day is made of. */
  day: {
    schema: z.object({
      workingHours: z.object({ start: TIME, end: TIME }).nullable(),
      dayParts: z.array(z.object({ name: z.string(), start: TIME, end: TIME, days: DAYS })).max(8),
    }),
    guidance: [
      'Pull out when their day starts and ends, and any named stretches inside it.',
      'A part of the day is a span with a character — "deep work", "mornings", "evenings with family". Give each one a short name and the hours it covers.',
      'If they only describe their waking hours, leave dayParts empty. If they only name stretches, leave workingHours null.',
      'A part can be limited to certain days: days are numbers with Sunday as 0 through Saturday as 6, "weekdays" is [1,2,3,4,5], and an empty list means every day. If they describe the same stretch differently on weekdays and at weekends, give two parts with the same name and different days.',
    ],
  },
  /** Fixed weekly commitments, and hours that are simply gone. */
  week: {
    schema: z.object({
      commitments: z.array(z.object({
        name: z.string(),
        daysOfWeek: DAYS,
        time: TIME,
        duration: z.number().int().min(5).max(720),
      })).max(12),
      busy: z.array(z.object({
        note: z.string(),
        days: DAYS,
        start: TIME,
        end: TIME,
      })).max(8),
    }),
    guidance: [
      'A commitment is a named thing that happens at the same time each week: a class, a shift, training, a standing meeting.',
      'Busy hours are stretches with no single name on them — "I work weekdays nine to five", "I commute an hour either side".',
      'Days are numbers with Sunday as 0 through Saturday as 6. "Weekdays" is [1,2,3,4,5]. "Every day" is [0,1,2,3,4,5,6].',
      'Durations are in minutes. "Two hours" is 120. If they give a start and an end, work the duration out.',
      'If they say a thing happens but never when, leave it out rather than inventing a time.',
    ],
  },
  /** What they do regularly. */
  habits: {
    schema: z.object({
      habits: z.array(z.object({
        name: z.string(),
        durationMinutes: z.number().int().min(0).max(480),
        /** True for whole-day habits, which never get a slot on the calendar. */
        anytime: z.boolean(),
        usualTime: TIME.nullable(),
      })).max(12),
    }),
    guidance: [
      'A habit is something they do regularly: training, reading, praying, journalling, walking the dog.',
      'Set anytime true when it belongs to the day rather than a time in it — drinking water, taking a vitamin, ten thousand steps. Those get no usualTime.',
      'Set usualTime only when they actually said roughly when. "In the morning" is 08:00, "after work" is 18:00, "before bed" is 22:00; anything vaguer stays null.',
      'Guess a sensible duration in minutes when they do not give one. Thirty is a fair default.',
    ],
  },
  /**
   * The free-text step, read for what it contains.
   *
   * The same ground as /api/onboarding/extract, and deliberately not the same
   * call: that one creates a proposal, this one only answers with names, so
   * the graph beside the form can show what the paragraph is about to become
   * while it is still being written.
   */
  notes: {
    schema: z.object({
      goals: z.array(z.object({ name: z.string() })).max(8),
      projects: z.array(z.object({ name: z.string() })).max(8),
      tasks: z.array(z.object({ name: z.string() })).max(15),
      notes: z.array(z.object({ title: z.string() })).max(5),
    }),
    guidance: [
      'A goal is something they are working towards. A project is a body of work. A task is one thing to do. Anything else worth keeping is a note.',
      'Do not turn one sentence into five tasks, and do not invent anything they did not say.',
    ],
  },
  /** What everything else is in service of. */
  goals: {
    schema: z.object({
      goals: z.array(z.object({ name: z.string() })).max(8),
      projects: z.array(z.object({ name: z.string() })).max(8),
    }),
    guidance: [
      'A goal is a direction — something they are working towards, with no single day it is done.',
      'A project is a body of work with an end: a build, a course, a report, a launch.',
      'Keep their words. Do not expand "get fitter" into three goals, and do not turn one goal into a goal and a project saying the same thing.',
    ],
  },
} as const

type SectionId = keyof typeof SECTIONS

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'No AI key configured' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { section?: string; text?: string }
  const section = body.section as SectionId | undefined
  const text = (body.text ?? '').trim()

  if (!section || !(section in SECTIONS)) {
    return Response.json({ error: 'Unknown part of setup.' }, { status: 400 })
  }
  // Short enough to be a cough rather than an answer.
  if (text.length < 8) return Response.json({ error: 'There was not enough there to go on.' }, { status: 400 })

  // Widened out of the union: each section has its own schema shape, and the
  // handler only ever passes it through to the model and back as JSON.
  const { schema, guidance }: { schema: z.ZodType; guidance: readonly string[] } = SECTIONS[section]

  try {
    const { output } = await generateText({
      model: defaultModel,
      system: [
        'Someone is setting up a life planner and has spoken their answer to one part of it out loud.',
        'The text you get is a transcript: it rambles, corrects itself, and has no punctuation you can trust. Read it for what they meant.',
        'Take only what they actually said. Leave a list empty rather than filling it, and never invent a detail to complete a row.',
        'When they correct themselves, the correction wins.',
        ...guidance,
        `Today is ${todayStr()}. Times are 24-hour HH:MM.`,
      ].join('\n'),
      prompt: text,
      output: Output.object({ schema }),
    })
    return Response.json({ ok: true, section, draft: output })
  } catch {
    return Response.json({ error: 'Could not make sense of that. Try saying it again, or type it in.' }, { status: 502 })
  }
}
