import { z } from 'zod'
import { parseTime, DEFAULT_TASK_MINUTES } from '@/lib/schedule'

/**
 * Capture: whatever the user said, turned into things on their day.
 *
 * The model's only job is reading — pulling the items out of a loose
 * sentence. Everything after that is decided here, in plain code: what
 * becomes a Task and what an Event, which day it lands on, how long it
 * takes, and whether it is really something already on the list. A model
 * that hands back "3pm" or "tmrw" or a 900-minute errand cannot put a wrong
 * thing on the calendar, because nothing it says is written as it said it.
 */

export const CaptureSchema = z.object({
  items: z.array(z.object({
    kind: z.enum(['task', 'event']).describe('event = happens at a fixed time (appointment, class, meeting); task = something to get done'),
    name: z.string().describe('Short, as the user would write it on a list. No date or time in the name.'),
    date: z.string().nullable().describe('YYYY-MM-DD, or null if they did not say a day'),
    time: z.string().nullable().describe('HH:MM 24h, only if they said a time'),
    minutes: z.number().nullable().describe('How long it takes, if said or obvious; null otherwise'),
    urgent: z.boolean().describe('true only if they said it matters, is urgent, or must happen'),
  })),
})

export type CapturedItem = z.infer<typeof CaptureSchema>['items'][number]

export interface CaptureNode {
  type: 'Task' | 'Event'
  /** Set when this is an open task already on the list: moved, not duplicated. */
  existingId?: number
  properties: Record<string, unknown>
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** Nobody plans a single errand longer than this from one sentence. */
const MAX_MINUTES = 8 * 60

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Items read out of a sentence, made safe to write.
 *
 * - No day, or a day already gone, means today: said now, it is for now.
 * - An "event" with no readable time is really a task — there is no slot to
 *   hold for it — rather than an event that nothing can place.
 * - Lengths that are missing or absurd become something plannable.
 * - The same thing said twice in one breath is one item.
 * - An open task already on the list is moved to the new day, not copied.
 */
export function toCaptureNodes(
  items: CapturedItem[],
  { today, openTasks }: { today: string; openTasks: { id: number; name: string }[] },
): CaptureNode[] {
  const open = new Map(openTasks.map((t) => [norm(t.name), t.id]))
  const seen = new Set<string>()
  const out: CaptureNode[] = []

  for (const item of items) {
    const name = item.name?.trim().replace(/[.!]+$/, '')
    if (!name) continue
    const key = norm(name)
    if (seen.has(key)) continue
    seen.add(key)

    const date = typeof item.date === 'string' && DATE.test(item.date) && item.date >= today ? item.date : today
    const time = parseTime(item.time)
    const minutes =
      typeof item.minutes === 'number' && Number.isFinite(item.minutes) && item.minutes > 0
        ? Math.min(Math.round(item.minutes), MAX_MINUTES)
        : null

    if (item.kind === 'event' && time !== null && time < 24 * 60) {
      out.push({
        type: 'Event',
        properties: { name, date, time: item.time!.trim().padStart(5, '0'), duration: minutes ?? 60 },
      })
      continue
    }

    out.push({
      type: 'Task',
      existingId: open.get(key),
      properties: {
        name,
        dueDate: date,
        estimatedMinutes: minutes ?? DEFAULT_TASK_MINUTES,
        ...(item.urgent ? { priority: 'high' } : {}),
      },
    })
  }
  return out
}

/**
 * The same sentence as one task, for when reading it fails.
 *
 * A capture must never be lost: no model, no key, a timeout — whatever
 * happens, what the user said lands on today as something to do, and they
 * can tidy it later. Losing it is the one outcome worse than a rough one.
 */
export function fallbackCapture(text: string, today: string): CaptureNode[] {
  const name = text.trim().replace(/\s+/g, ' ').slice(0, 140)
  return name ? [{ type: 'Task', properties: { name, dueDate: today, estimatedMinutes: DEFAULT_TASK_MINUTES } }] : []
}
