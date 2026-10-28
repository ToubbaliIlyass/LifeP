import { addDays, nextDueDate } from '@/lib/date'

/**
 * Skipping one time round of a repeating to-do.
 *
 * A repeating to-do is a single node standing for its current occurrence
 * (src/lib/tasks.ts): ticking it hands off to the next. Skipping is the same
 * hand-off without the tick — the node moves to its next day on the rule, and
 * nothing is recorded as done. No ActivitySignal is written, so streaks and
 * the rhythm chart never see it, and nothing counts it as missed either.
 *
 * `skipped` on the node remembers { from, to } for each recent skip, which is
 * all Undo needs, and lets it refuse once the to-do has been changed since.
 *
 * Pure, so the rules read (and are tested) in one place. No storage change:
 * it all lives in the node's existing JSON properties.
 */

export interface Skip { from: string; to: string }

const FREQUENCIES = ['daily', 'weekly', 'weekdays']
const DATE = /^\d{4}-\d{2}-\d{2}$/
/** How many recent skips a node remembers. */
export const SKIP_KEEP = 10

type Props = Record<string, unknown>
type Rule = { frequency: string; daysOfWeek: number[] | null }

export function ruleOf(p: Props): Rule | null {
  const r = p.recurrence as { frequency?: unknown; daysOfWeek?: unknown } | undefined
  if (!r || typeof r.frequency !== 'string' || !FREQUENCIES.includes(r.frequency)) return null
  const days = Array.isArray(r.daysOfWeek) ? r.daysOfWeek.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : []
  return { frequency: r.frequency, daysOfWeek: days.length ? days : null }
}

export function skipsOf(p: Props): Skip[] {
  if (!Array.isArray(p.skipped)) return []
  return p.skipped.flatMap((s) => {
    const x = (s ?? {}) as Record<string, unknown>
    return typeof x.from === 'string' && typeof x.to === 'string' && DATE.test(x.from) && DATE.test(x.to) ? [{ from: x.from, to: x.to }] : []
  })
}

export type SkipResult =
  | { ok: true; props: Props; from: string; to: string }
  | { ok: false; reason: 'not-repeating' | 'finished' | 'no-day' | 'last' | 'moved' }

/**
 * Moves a repeating to-do past the occurrence it is on.
 *
 * `today` is the user's today (src/lib/clock.ts). An occurrence already gone
 * (overdue) is dropped and the to-do lands on the first day the rule has from
 * today on, which may be today itself — that one has not been skipped.
 * `expected` is the day the caller saw it on; if the to-do is no longer there
 * (a double click, another device), nothing moves a second time.
 */
export function skipOccurrence(p: Props, today: string, expected?: string): SkipResult {
  const rule = ruleOf(p)
  if (!rule) return { ok: false, reason: 'not-repeating' }
  if (p.status === 'done' || p.someday === true) return { ok: false, reason: 'finished' }
  const from = typeof p.dueDate === 'string' && DATE.test(p.dueDate) ? p.dueDate : null
  if (!from) return { ok: false, reason: 'no-day' }
  if (expected !== undefined && expected !== from) return { ok: false, reason: 'moved' }

  const to = nextDueDate(from < today ? addDays(today, -1) : from, rule.frequency, rule.daysOfWeek)
  // A deadline is where a repeating to-do stops; skipping the last one has nowhere to go.
  const deadline = typeof p.deadline === 'string' ? p.deadline : null
  if (deadline && to > deadline) return { ok: false, reason: 'last' }

  const next: Props = { ...p, dueDate: to }
  next.skipped = [...skipsOf(p), { from, to }].slice(-SKIP_KEEP)
  // A snooze and a one-off reminder were for the occurrence just skipped.
  delete next.snoozedUntil
  if (typeof next.remindAt === 'string' && next.remindAt.slice(0, 10) <= from) delete next.remindAt
  return { ok: true, props: next, from, to }
}

export type UnskipResult =
  | { ok: true; props: Props; from: string; to: string }
  | { ok: false; reason: 'nothing-to-undo' | 'changed' }

/** Puts a skipped occurrence back — only while the to-do is still exactly where the skip left it. */
export function unskipOccurrence(p: Props, from: string): UnskipResult {
  const skips = skipsOf(p)
  const skip = [...skips].reverse().find((s) => s.from === from)
  if (!skip) return { ok: false, reason: 'nothing-to-undo' }
  if (p.status === 'done' || p.dueDate !== skip.to) return { ok: false, reason: 'changed' }
  const next: Props = { ...p, dueDate: skip.from }
  const left = skips.filter((s) => s !== skip)
  if (left.length) next.skipped = left
  else delete next.skipped
  return { ok: true, props: next, from: skip.from, to: skip.to }
}
