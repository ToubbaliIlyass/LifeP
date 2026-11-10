import { z } from 'zod'

/**
 * Setup, said out loud: what the model may hand back, and how it is made safe.
 *
 * Same rule as capture (src/lib/capture.ts): the model only reads the
 * sentence. Days, times and lengths come back through these functions, so a
 * "25:70" or a day 9 cannot reach the calendar however it was said.
 */

export const STEPS = ['week', 'who', 'when'] as const
export type Step = (typeof STEPS)[number]

/** A fixed, weekly thing: becomes an Event on the calendar. */
export interface WeekItem { name: string; days: number[]; time: string; minutes: number }
/** A person they are becoming: becomes an Identity. */
export interface WhoItem { name: string }
/** When they like to do things: becomes an availability rule the planner reads. */
export interface WhenItem { kind: 'prefer' | 'busy' | 'free'; activity: string; days: number[]; start: string; end: string }

const days = z.array(z.number()).describe('0=Sunday … 6=Saturday. "weekdays" is [1,2,3,4,5]; "every day" is [0,1,2,3,4,5,6].')

export const WeekSchema = z.object({
  items: z.array(z.object({
    name: z.string().describe('Short, as they would write it: "Lecture", "Shift", "Gym class".'),
    days,
    time: z.string().describe('Start, HH:MM 24h.'),
    minutes: z.number().nullable().describe('How long, if said; null otherwise.'),
  })),
})

export const WhoSchema = z.object({
  items: z.array(z.object({
    name: z.string().describe('Finishes "I’m becoming …": "a runner", "someone who writes". Lower case, short.'),
  })),
})

export const WhenSchema = z.object({
  items: z.array(z.object({
    kind: z.enum(['prefer', 'busy', 'free']).describe('prefer = they like to do `activity` then; busy = never plan anything then; free = good time for anything.'),
    activity: z.string().nullable().describe('What they like to do then ("work out", "study"), for prefer; null otherwise.'),
    days,
    start: z.string().describe('HH:MM 24h. "morning" is 06:00–12:00, "afternoon" 12:00–17:00, "evening" 17:00–22:00, "night" 21:00–23:30.'),
    end: z.string().describe('HH:MM 24h.'),
  })),
})

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX = 20

const cleanDays = (d: unknown): number[] =>
  Array.isArray(d) ? [...new Set(d.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b) : []

const clip = (s: unknown, n = 60) => (typeof s === 'string' ? s.trim().replace(/[.!]+$/, '').slice(0, n) : '')

export function cleanWeek(items: Partial<WeekItem>[]): WeekItem[] {
  const seen = new Set<string>()
  const out: WeekItem[] = []
  for (const i of items) {
    const name = clip(i.name)
    const d = cleanDays(i.days)
    if (!name || !d.length || !i.time || !TIME.test(i.time)) continue
    const minutes = typeof i.minutes === 'number' && i.minutes >= 10 && i.minutes <= 12 * 60 ? Math.round(i.minutes) : 60
    const key = `${name.toLowerCase()}|${d.join()}|${i.time}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, days: d, time: i.time, minutes })
  }
  return out.slice(0, MAX)
}

export function cleanWho(items: Partial<WhoItem>[]): WhoItem[] {
  const seen = new Set<string>()
  const out: WhoItem[] = []
  for (const i of items) {
    const name = clip(i.name, 80).replace(/^i['’]?m becoming\s+/i, '')
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({ name })
  }
  return out.slice(0, 8)
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

export function cleanWhen(items: Partial<WhenItem>[]): WhenItem[] {
  const out: WhenItem[] = []
  for (const i of items) {
    if (!i.kind || !['prefer', 'busy', 'free'].includes(i.kind)) continue
    if (!i.start || !i.end || !TIME.test(i.start) || !TIME.test(i.end) || mins(i.end) <= mins(i.start)) continue
    const activity = clip(i.activity)
    // A preference is about something; without it there is nothing to prefer.
    if (i.kind === 'prefer' && !activity) continue
    const d = cleanDays(i.days)
    const key = `${i.kind}|${activity.toLowerCase()}|${d.join()}|${i.start}|${i.end}`
    if (out.some((o) => `${o.kind}|${o.activity.toLowerCase()}|${o.days.join()}|${o.start}|${o.end}` === key)) continue
    out.push({ kind: i.kind, activity, days: d, start: i.start, end: i.end })
  }
  return out.slice(0, MAX)
}
