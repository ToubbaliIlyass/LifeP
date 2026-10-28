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
  /** Whole days since Acture was last opened; 0 when it was today. */
  daysAway: number
}

export interface Mood {
  state: TuckState
  line: string
  /** Part of what the dismissal is remembered under, so a different mood is not hidden by it. */
  key: string
  /** What the one button does, when there is one. */
  action?: { label: string; kind: 'triage' | 'break-down'; todoId?: number }
}

/** At least this many things overdue is a heavy day, not a busy one. */
export const HEAVY_DAY = 5
/** A to-do this many days past its day has sat long enough to offer help with. */
export const STUCK_DAYS = 7
/** How soon a timed to-do counts as coming up, in minutes. */
export const SOON_MINUTES = 30

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** The numbers the pick is made from, also shown in the proof. */
export interface DayFacts {
  today: string
  open: Todo[]
  doneToday: number
  overdue: number
  streak: number
  finished: number
  level: TuckLevel
}

export function dayFacts(i: MoodInput): DayFacts {
  const today = localDateStr(i.now)
  const live = i.todos.filter((t) => t.type !== 'Prayer' && !inDoneList(t, i.lists))
  const open = live.filter((t) => !t.done && isToday(t, today))
  const doneToday = live.filter((t) => t.done && t.doneAt && localDateStr(new Date(t.doneAt)) === today).length
  const overdue = open.filter((t) => (t.when && t.when < today) || (t.deadline && t.deadline < today)).length
  const streak = i.todos.reduce((m, t) => (t.type === 'Habit' ? Math.max(m, t.streak ?? 0) : m), 0)
  const finished = i.todos.filter((t) => t.done && t.type !== 'Prayer').length
  return { today, open, doneToday, overdue, streak, finished, level: levelFor(finished) }
}

export function pickMood(i: MoodInput): Mood | null {
  const f = dayFacts(i)
  const hour = i.now.getHours()
  const minutes = hour * 60 + i.now.getMinutes()

  // Back after days away: no overdue lecture, just a place to start.
  if (i.daysAway >= 3) return { state: 'welcome-back', key: 'welcome-back', line: 'Welcome back. Nothing is on fire, let’s start small.' }

  if (f.overdue >= HEAVY_DAY) {
    return { state: 'overwhelmed-support', key: 'overwhelmed', line: 'Big day. Let’s shelter these first and take it one at a time.', action: { label: 'Help me sort it', kind: 'triage' } }
  }

  // Something with a time that is about to start.
  const soon = f.open
    .filter((t) => t.time && minutesOf(t.time) - minutes >= 0 && minutesOf(t.time) - minutes <= SOON_MINUTES)
    .sort((a, b) => minutesOf(a.time!) - minutesOf(b.time!))[0]
  if (soon) return { state: 'nudge', key: `nudge:${soon.id}`, line: `Psst, “${soon.title || 'a to-do'}” is coming up at ${soon.time}.` }

  // Sat for a week: offered help, not blame.
  const stuck = f.open
    .map((t) => ({ t, since: t.when ?? t.deadline }))
    .filter((x): x is { t: Todo; since: string } => !!x.since && daysBetween(x.since, f.today) >= STUCK_DAYS && x.t.type === 'Task')
    .sort((a, b) => a.since.localeCompare(b.since))[0]
  if (stuck) {
    return { state: 'stuck-helper', key: `stuck:${stuck.t.id}`, line: `Stuck on “${stuck.t.title || 'this one'}”? Take my trowel, we’ll dig together.`, action: { label: 'Break it down', kind: 'break-down', todoId: stuck.t.id } }
  }

  if (f.doneToday > 0 && f.open.length === 0) return { state: 'all-done', key: 'all-done', line: 'All clear. The garden is tidy.' }

  if (f.streak >= 3) return { state: 'streak', key: `streak:${f.streak}`, line: `${f.streak} days in a row. Watered.` }

  // An event is on right now.
  const on = i.events.find((e) => e.date === f.today && e.time && minutesOf(e.time) <= minutes && minutes < minutesOf(e.time) + e.minutes)
  if (on) return { state: 'focus', key: `focus:${on.id}`, line: `${on.title} is on. I’ll keep quiet.` }

  // The small hours, then the late evening.
  if (hour < 5) {
    return f.open.length === 0
      ? { state: 'deep-sleep', key: 'deep-sleep', line: 'Nothing due. Sleeping.' }
      : { state: 'night-sleepy', key: 'night-sleepy', line: 'Getting sleepy. Want me to save the rest for tomorrow?' }
  }
  if (hour >= 22) return { state: 'night-sleepy', key: 'night-sleepy', line: 'Getting sleepy. Want me to save the rest for tomorrow?' }

  // The first look at the day. (From 20:00 the evening check-in speaks instead.)
  // With nothing on the list the empty state has its own Tuck: one is enough.
  if (f.open.length === 0 && f.doneToday === 0) return null
  if (hour < 11) return { state: 'morning-wake', key: 'morning', line: 'Morning. Stretching first, then plans.' }
  if (hour < 20 && f.doneToday === 0) return { state: 'greeting', key: 'greeting', line: 'Hello. Shall we see what today looks like?' }
  return null
}

/** Whole days between the last time the app was opened and today. */
export function daysSince(last: string | null, today: string): number {
  if (!last || last > today) return 0
  return Math.max(0, daysBetween(last, today))
}

/** What a toast says about a to-do that was just ticked, if it is worth saying. */
export function momentFor(done: Todo, before: DayFacts, after: DayFacts, finishedList?: TodoList | null): Mood | null {
  if (after.level !== before.level && after.level !== 'seed') {
    return after.level === 'bloom'
      ? { state: 'level-bloom', key: 'level', line: 'Look, it bloomed.' }
      : { state: 'level-sprout', key: 'level', line: 'Growing steadily. Your sprout is up.' }
  }
  if (finishedList) return { state: 'milestone', key: 'milestone', line: `“${finishedList.title || 'That project'}” is finished. Look how much has grown.` }
  if (done.type === 'Habit' && (done.streak ?? 0) >= 2) {
    return { state: 'streak', key: 'streak', line: `${(done.streak ?? 0) + 1} days in a row. Watered.` }
  }
  if (after.open.length === 0 && after.doneToday > 0) {
    return after.doneToday >= 3
      ? { state: 'celebrating', key: 'celebrate', line: 'We did it! Everything for today is done.' }
      : { state: 'all-done', key: 'all-done', line: 'All clear. The garden is tidy.' }
  }
  return { state: 'task-done', key: 'task-done', line: 'One down. Nice.' }
}

