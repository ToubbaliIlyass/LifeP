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
