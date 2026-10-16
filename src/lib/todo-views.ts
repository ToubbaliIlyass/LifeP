import type { Todo, TodoList } from '@/lib/todos'

/**
 * Which list a to-do shows in.
 *
 * Nothing is filed anywhere: a to-do has a day it is for, perhaps a deadline,
 * perhaps a project, and every list is a question asked of those. Kept pure
 * and apart from the screen so the rules can be read, and tested, in one go.
 *
 *   Inbox     no day, no place — said, and not yet decided
 *   Today     for today or earlier, or due by today; habits due today; prayers
 *   Upcoming  for a later day, or with a deadline still ahead and no day yet
 *   Anytime   has a place and could be done now
 *   Someday   parked on purpose
 *
 * There is no list for things that repeat. A to-do that comes round again is
 * still a to-do: it is on Today when it is due, like everything else.
 */

export const STANDARD_VIEWS = ['inbox', 'today', 'upcoming', 'anytime', 'someday', 'logbook'] as const
export type StandardView = (typeof STANDARD_VIEWS)[number]

const isTask = (t: Todo) => t.type === 'Task'

export function isToday(t: Todo, today: string): boolean {
  if (t.type === 'Prayer') return true
  if (t.type === 'Habit') return t.when === today
  return !t.someday && ((!!t.when && t.when <= today) || (!!t.deadline && t.deadline <= today))
}

export const inInbox = (t: Todo) => isTask(t) && !t.listId && !t.when && !t.someday

export function isUpcoming(t: Todo, today: string): boolean {
  if (!isTask(t) || t.someday) return false
  return (!!t.when && t.when > today) || (!t.when && !!t.deadline && t.deadline > today)
}

/** The day an upcoming to-do is listed under. */
export const upcomingDay = (t: Todo) => t.when ?? t.deadline

export function isAnytime(t: Todo, today: string): boolean {
  return isTask(t) && !t.someday && !inInbox(t) && !(t.when && t.when > today)
}

export const isSomeday = (t: Todo) => isTask(t) && t.someday

/** A to-do in a finished project is finished with it, wherever else it would show. */
export function inDoneList(t: Todo, lists: TodoList[]): boolean {
  return t.listId !== null && lists.some((l) => l.id === t.listId && l.done)
}

export const byOrder = <T extends { order: number; id: number }>(a: T, b: T) => a.order - b.order || a.id - b.id

/** Today's order: what has a time, in time order; then the rest as arranged. */
export function byDay(a: Todo, b: Todo): number {
  if (a.time && b.time) return a.time.localeCompare(b.time) || byOrder(a, b)
  if (a.time) return -1
  if (b.time) return 1
  return byOrder(a, b)
}

/** The sidebar's numbers. `due` is what on Today has a deadline that has arrived. */
export function counts(todos: Todo[], lists: TodoList[], today: string) {
  let inbox = 0
  let day = 0
  let due = 0
  for (const t of todos) {
    if (t.done || inDoneList(t, lists)) continue
    if (inInbox(t)) inbox++
    if (isToday(t, today)) {
      day++
      if (t.deadline && t.deadline <= today) due++
    }
  }
  return { inbox, today: day, due }
}

/** How far through a project is, 0–1. */
export function progress(list: TodoList, todos: Todo[]): number {
  if (list.done) return 1
  const mine = todos.filter((t) => t.listId === list.id && t.type === 'Task')
  return mine.length ? mine.filter((t) => t.done).length / mine.length : 0
}

// ── Dates, as they are said ────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const parseDay = (s: string) => new Date(s + 'T00:00:00')

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 864e5)
}

export function relDate(day: string, today: string): string {
  const n = daysBetween(today, day)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  const d = parseDay(day)
  if (n > 1 && n < 7) return DAYS[d.getDay()]
  const year = d.getFullYear() !== parseDay(today).getFullYear() ? ` ${d.getFullYear()}` : ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`
}

export function deadlineLabel(deadline: string, today: string): { text: string; tone: 'over' | 'soon' | 'calm' } {
  const n = daysBetween(today, deadline)
  if (n < 0) return { text: `${-n} day${n === -1 ? '' : 's'} overdue`, tone: 'over' }
  if (n === 0) return { text: 'Due today', tone: 'over' }
  if (n === 1) return { text: 'Due tomorrow', tone: 'soon' }
  return { text: `${n} days left`, tone: n <= 2 ? 'soon' : 'calm' }
}

export function repeatLabel(repeats: string | null): string {
  if (repeats === 'weekdays') return 'Weekdays'
  if (repeats === 'weekly') return 'Weekly'
  return 'Every day'
}
