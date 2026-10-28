/**
 * How one showing-up of an event went: attended, cancelled, or not gone to.
 *
 * An event is a single node that stands for every occurrence of a repeating
 * one (see eventOccursOn in src/lib/date.ts), so what happened is kept per
 * day, in the node's existing JSON properties, as
 *   resolved: { '2026-10-28': 'attended', '2026-10-29': 'cancelled' }
 * (the same no-migration pattern as `skipped` in src/lib/skip.ts). Resolving
 * only touches the day asked for; the rest of the series is as it was.
 *
 * Attended counts as the day's thing done. Cancelled (called off by someone
 * else) and missed ("didn't go") only clear it from the day: neither is ever
 * counted as a miss, and no ActivitySignal is written, so streaks, rhythm and
 * the garden's growth (which count finished to-dos) never see them.
 *
 * Pure, so the rules are read and tested in one place.
 */

export type EventStatus = 'attended' | 'cancelled' | 'missed'
export const EVENT_STATUSES: readonly EventStatus[] = ['attended', 'cancelled', 'missed']

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** How many days of history one event keeps; older ones are dropped on the next write. */
export const RESOLVED_KEEP = 60

type Props = Record<string, unknown>

export const isEventStatus = (v: unknown): v is EventStatus => typeof v === 'string' && (EVENT_STATUSES as readonly string[]).includes(v)

export function resolvedOf(p: Props): Record<string, EventStatus> {
  const r = p.resolved
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {}
  const out: Record<string, EventStatus> = {}
  for (const [day, s] of Object.entries(r as Record<string, unknown>)) if (DATE.test(day) && isEventStatus(s)) out[day] = s
  return out
}

/** What happened on `date`, or null when it is still to come / unresolved. */
export const statusOn = (p: Props, date: string): EventStatus | null => resolvedOf(p)[date] ?? null

/**
 * Sets (or, with null, clears) the status of one occurrence. Returns the new
 * properties; the caller has already checked the event occurs on `date`.
 */
export function resolveOccurrence(p: Props, date: string, status: EventStatus | null): Props {
  const next: Props = { ...p }
  const all = resolvedOf(p)
  if (status) all[date] = status
  else delete all[date]
  const kept = Object.keys(all).sort().slice(-RESOLVED_KEEP)
  if (kept.length) next.resolved = Object.fromEntries(kept.map((d) => [d, all[d]]))
  else delete next.resolved
  // A snooze and a one-off reminder were for the occurrence now settled.
  if (status && typeof next.snoozedUntil === 'string' && next.snoozedUntil.slice(0, 10) === date) delete next.snoozedUntil
  return next
}
