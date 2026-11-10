import { addDays } from '@/lib/date'
import { planCatchUp } from '@/lib/catch-up'
import { pickMood, type Mood, type MoodInput } from '@/lib/tuck/mood'

/**
 * The one thing Tuck says at the top of Today.
 *
 * There used to be four cards that each decided for themselves whether to
 * appear (a greeting, the week, the missed pile, the evening question), and
 * on a bad evening they stacked, saying the same thing in different voices.
 * Now they are one slot with a fixed order, so there is never more than one
 * message, and the first that has something to say wins:
 *
 *   1. catch-up   three or more slipped: there is something to do about it
 *   2. week       Sunday afternoon to Monday: the week looked back on
 *   3. check-in   from 20:00: how did today go
 *   4. help       one to-do has sat for a week: offer to break it down
 *
 * What was dropped: the hello, the morning and "nothing is due, sleeping"
 * lines, the rhythm line (the week card has the same count), the "coming up"
 * nudge (the Now card is that), and "all clear" (the empty state is that).
 * A message put away stays away for its day, or its week for the week.
 */

export type TodayCard =
  | { kind: 'catch-up' }
  | { kind: 'week'; sunday: string }
  | { kind: 'check-in' }
  | { kind: 'help'; mood: Mood }

/** The evening check-in opens at 20:00, when there is enough of the day to look back on. */
export const CHECK_IN_FROM = 20 * 60

/** Where each card's "put away" is remembered. One place, so the resolver and the card agree. */
export const awayKey = {
  catchUp: (date: string) => `acture-catchup:${date}`,
  week: (sunday: string) => `acture-week:${sunday}`,
  checkIn: (date: string) => `acture-checkin:${date}`,
  help: (date: string, moodKey: string) => `acture-tuck:${date}:${moodKey}`,
}

/** The Sunday that names the week a day belongs to. */
export function sundayOf(date: string): string {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return day === 0 ? date : addDays(date, -day)
}

/** Sunday from 16:00 to Monday 14:00. */
export function inWeekWindow(date: string, hour: number): boolean {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return (day === 0 && hour >= 16) || (day === 1 && hour < 14)
}

export function pickTodayCard(
  input: MoodInput & { date: string; away: (key: string) => boolean },
): TodayCard | null {
  const { date, away } = input
  const hour = input.now.getHours()
  const minutes = hour * 60 + input.now.getMinutes()

  if (!away(awayKey.catchUp(date)) && planCatchUp(input.todos, date, input.lists)?.moves.length) return { kind: 'catch-up' }

  const sunday = sundayOf(date)
  if (inWeekWindow(date, hour) && !away(awayKey.week(sunday))) return { kind: 'week', sunday }

  if (minutes >= CHECK_IN_FROM && !away(awayKey.checkIn(date))) return { kind: 'check-in' }

  const mood = pickMood(input)
  if (mood && !away(awayKey.help(date, mood.key))) return { kind: 'help', mood }
  return null
}
