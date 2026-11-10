/**
 * Which Tuck shows up on Today, and why.
 *
 * Pure and apart from the screen, like src/lib/todo-views.ts: the clock, the
 * day's to-dos and how long it has been go in, one pose and one short line
 * come out (or nothing, which is most of the time — a calm app does not
 * greet you every minute).
 *
 * Only what the app really knows is used. There is no "focus mode" and no
 * count of how often something was put off, so `focus` is shown while an
 * event is on, and `stuck-helper` for a to-do that has sat for a week.
 *
 * Never a lecture: a long absence is "let's start small", a heavy day is
 * "one at a time". Nothing here counts what was missed.
 */

import { activeDaysOf } from '@/lib/week-reflection'
import { localDateStr } from '@/lib/date'
import { daysBetween, isToday } from '@/lib/todo-views'
import type { DayEvent, Todo, TodoList } from '@/lib/todos'
import { inDoneList } from '@/lib/todo-views'
import { levelFor, type TuckLevel, type TuckState } from './states'

export interface MoodInput {
  /** The wall clock: see wallNow() in src/lib/wallclock.ts. */
  now: Date
  todos: Todo[]
  lists: TodoList[]
  events: DayEvent[]
}

export interface Mood {
  state: TuckState
  line: string
  /** Part of what the dismissal is remembered under, so a different mood is not hidden by it. */
  key: string
  /** What the one button does, when there is one. */
  action?: { label: string; kind: 'break-down'; todoId: number }
}

/** A to-do this many days past its day has sat long enough to offer help with. */
export const STUCK_DAYS = 7
/** The numbers the pick is made from, also shown in the proof. */
export interface DayFacts {
  today: string
  open: Todo[]
  doneToday: number
  /** Today's events still to settle (attended / cancelled / not gone to). */
  openEvents: number
  /** Today's events already settled, whichever way. */
  settledEvents: number
  overdue: number
  /** Of the last seven days, how many had something finished: a rhythm, not a chain that breaks. */
  activeDays: number
  finished: number
  level: TuckLevel
}

export function dayFacts(i: MoodInput): DayFacts {
  const today = localDateStr(i.now)
  const live = i.todos.filter((t) => !t.prayerKey && !inDoneList(t, i.lists))
  const open = live.filter((t) => !t.done && isToday(t, today, i.lists))
  const doneToday = live.filter((t) => t.done && t.doneAt && localDateStr(new Date(t.doneAt)) === today).length
  const todays = i.events.filter((e) => e.date === localDateStr(i.now))
  const openEvents = todays.filter((e) => !e.status).length
  const settledEvents = todays.length - openEvents
  const overdue = open.filter((t) => (t.when && t.when < today) || (t.deadline && t.deadline < today)).length
  const activeDays = activeDaysOf(live, today)
  const finished = i.todos.filter((t) => t.done && !t.prayerKey).length
  return { today, open, doneToday, openEvents, settledEvents, overdue, activeDays, finished, level: levelFor(finished) }
}

/**
 * The one thing worth a card on Today besides the day's own: a to-do that has
 * sat for a week, offered help rather than blame. Everything else Tuck used
 * to say here (greetings, "all clear", a nudge for what is about to start)
 * repeated the Now card, the empty state or the week card, and is gone; see
 * src/lib/today-card.ts for what is shown and in what order.
 */
export function pickMood(i: MoodInput): Mood | null {
  const f = dayFacts(i)
  const stuck = f.open
    .map((t) => ({ t, since: t.when ?? t.deadline }))
    .filter((x): x is { t: Todo; since: string } => !!x.since && daysBetween(x.since, f.today) >= STUCK_DAYS)
    .sort((a, b) => a.since.localeCompare(b.since))[0]
  if (!stuck) return null
  return { state: 'stuck-helper', key: `stuck:${stuck.t.id}`, line: `Stuck on “${stuck.t.title || 'this one'}”? Take my trowel, we’ll dig together.`, action: { label: 'Break it down', kind: 'break-down', todoId: stuck.t.id } }
}

/** What a toast says about a to-do that was just ticked, if it is worth saying. */
export function momentFor(done: Todo, before: DayFacts, after: DayFacts, finishedList?: TodoList | null): Mood | null {
  if (after.level !== before.level && after.level !== 'seed') {
    return after.level === 'bloom'
      ? { state: 'level-bloom', key: 'level', line: 'Look, it bloomed.' }
      : { state: 'level-sprout', key: 'level', line: 'Growing steadily. Your sprout is up.' }
  }
  if (finishedList) return { state: 'milestone', key: 'milestone', line: `“${finishedList.title || 'That project'}” is finished. Look how much has grown.` }
  if (after.open.length === 0 && after.openEvents === 0 && (after.doneToday > 0 || after.settledEvents > 0)) {
    return after.doneToday >= 3
      ? { state: 'celebrating', key: 'celebrate', line: 'We did it! Everything for today is done.' }
      : { state: 'all-done', key: 'all-done', line: 'All clear. The garden is tidy.' }
  }
  return { state: 'task-done', key: 'task-done', line: cheer(after.doneToday) }
}

/** What Tuck says as the day's ticks add up: the first, a run, a good day. Varied, so it never reads as a canned line. */
const CHEERS = ['Nice one.', 'That’s one more.', 'Smooth.', 'Look at you go.', 'Another one off the list.', 'Steady. I like it.']
export function cheer(doneToday: number): string {
  if (doneToday <= 1) return 'First one done. That’s how a day starts.'
  if (doneToday === 3) return 'Three today. You’re rolling.'
  if (doneToday === 5) return 'Five! Today’s a good one.'
  if (doneToday >= 8 && doneToday % 4 === 0) return `${doneToday} done today. Wow.`
  return CHEERS[doneToday % CHEERS.length]
}

