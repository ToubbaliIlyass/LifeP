/**
 * Formats a Date as YYYY-MM-DD using its LOCAL calendar date.
 *
 * `date.toISOString().split('T')[0]` looks equivalent but isn't: it
 * serializes through UTC, so for any positive UTC offset (GMT+1 and
 * east), a Date built from local midnight (`new Date(str + 'T00:00:00')`)
 * lands on the *previous* UTC day — every `setDate` offset built that way
 * comes out exactly one day early, silently, every time. This was
 * reproduced live: `startOfWeek('2026-09-04')` (a Friday) returned
 * '2026-08-29' instead of the correct '2026-08-30'.
 */
export function localDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayStr(): string {
  return localDateStr(new Date())
}

/** Adds (or subtracts, for negative `days`) whole days to a YYYY-MM-DD date string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

/**
 * Shared recurrence rule for anything with a `frequency`/`daysOfWeek` pair
 * (Habits today, recurring Tasks as of Phase 2) — is a given day-of-week
 * (0=Sun..6=Sat) one this thing is due on.
 */
export function isDueOn(frequency: string, daysOfWeek: number[] | null, dow: number): boolean {
  if (frequency === 'weekdays') {
    if (daysOfWeek && daysOfWeek.length) return daysOfWeek.includes(dow)
    return dow >= 1 && dow <= 5
  }
  if (frequency === 'weekly') return daysOfWeek?.includes(dow) ?? false
  return true // daily, and anything unrecognized, defaults to due every day
}

/** The recurrence fields an Event carries. All optional — most events happen once. */
export interface EventRecurrence {
  /** The first (or only) day it happens. */
  date: string | null
  /** 'once' | 'daily' | 'weekdays' | 'weekly' — same vocabulary as Habits. */
  frequency?: string | null
  /** For 'weekly'/'weekdays': which days, 0=Sun..6=Sat. */
  daysOfWeek?: number[] | null
  /** Optional last day; open-ended without it. */
  until?: string | null
}

/**
 * Whether a recurring event falls on `date`.
 *
 * Events used to be a single fixed day, which meant a weekly class or a
 * standing meeting had to be re-entered every time — the one kind of entry
 * most worth automating. They now use the same frequency/daysOfWeek pair as
 * Habits, so "every Tuesday and Thursday" means the same thing in both
 * places, and `isDueOn` stays the single definition of that rule.
 *
 * Occurrences are computed on read rather than written out as rows: nothing
 * to backfill when a rule changes, and no cleanup when one is deleted.
 */
export function eventOccursOn(e: EventRecurrence, date: string): boolean {
  if (!e.date) return false

  const frequency = e.frequency ?? 'once'
  // 'none' is what earlier events stored; treat it the same as 'once'.
  if (frequency === 'once' || frequency === 'none') return e.date === date

  if (date < e.date) return false
  if (e.until && date > e.until) return false

  const dow = new Date(date + 'T00:00:00').getDay()
  return isDueOn(frequency, e.daysOfWeek ?? null, dow)
}

/** The next date (strictly after `fromDateStr`) that satisfies a frequency/daysOfWeek rule. */
export function nextDueDate(fromDateStr: string, frequency: string, daysOfWeek: number[] | null): string {
  let candidate = fromDateStr
  for (let i = 0; i < 400; i++) {
    candidate = addDays(candidate, 1)
    const dow = new Date(candidate + 'T00:00:00').getDay()
    if (isDueOn(frequency, daysOfWeek, dow)) return candidate
  }
  return addDays(fromDateStr, 1) // unreachable in practice; keeps the return type total
}
