import { addDays } from '@/lib/date'
import type { ActivitySignal } from '@/lib/availability'

/**
 * A to-do's rhythm: when it really got done, day by day, beside when it was
 * planned — the chart the landing page promises ("planned 07:00, done around
 * 19:15"), drawn from the same signals the planner learns from, so what it
 * shows is what tomorrow's plan follows.
 */

/** How far back the chart looks. Two weeks: enough to see a pattern, short enough to see it change. */
export const RHYTHM_DAYS = 14

export interface Rhythm {
  /** Oldest first, ending today. `minute` is when it got done that day, or null. */
  days: { date: string; minute: number | null }[]
  /** Where it is planned, as minutes past midnight, if anywhere. */
  planned: number | null
  /** When it usually gets done, once the planner trusts it (see usualStart). */
  usual: number | null
  /** Days in the window it got done. */
  doneDays: number
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

/**
 * Pure. `signals` are one series' (see seriesOf), in the order recorded.
 *
 * One point a day. Said beats ticked — "went at seven" in the evening
 * check-in is a correction of a tick remembered late — and otherwise the
 * last word that day wins.
 */
export function buildRhythm({ today, signals, planned, usual }: {
  today: string
  signals: Pick<ActivitySignal, 'kind' | 'date' | 'minute' | 'plannedMinute'>[]
  /** Its slot today, when it has one; otherwise read from where it was planned lately. */
  planned: number | null
  usual: number | null
}): Rhythm {
  const from = addDays(today, -(RHYTHM_DAYS - 1))
  const recent = signals.filter((s) => s.date >= from && s.date <= today && typeof s.minute === 'number' && (s.kind === 'done' || s.kind === 'reported'))

  const byDate = new Map<string, { minute: number; said: boolean }>()
  for (const s of recent) {
    const said = s.kind === 'reported'
    const had = byDate.get(s.date)
    if (had?.said && !said) continue
    byDate.set(s.date, { minute: s.minute!, said })
  }

  const days = Array.from({ length: RHYTHM_DAYS }, (_, i) => {
    const date = addDays(from, i)
    return { date, minute: byDate.get(date)?.minute ?? null }
  })

  const plannedLately = recent.map((s) => s.plannedMinute).filter((m): m is number => typeof m === 'number')
  return {
    days,
    planned: planned ?? (plannedLately.length ? median(plannedLately) : null),
    usual,
    doneDays: byDate.size,
  }
}
