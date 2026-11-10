import type { Todo, TodoList } from '@/lib/todos'
import { hiddenFromToday } from '@/lib/todo-views'
import { addDays } from '@/lib/date'

/** How many to-dos a day can carry before a missed pile should look elsewhere. */
export const DAY_LOAD = 3
/** The most one coming day takes from the pile. */
const PER_DAY = 2
/** The pile has to be this big before it is worth saying anything. */
export const PILE = 3
const HORIZON = 14

export interface CatchUpMove { id: number; title: string; from: string; to: string }
export interface CatchUp {
  /** Everything that slipped and is still open, most pressing first. */
  slipped: Todo[]
  /** What stays on today. */
  keep: Todo[]
  /** Where the rest would go. */
  moves: CatchUpMove[]
}

/**
 * After missed days: the open to-dos whose day has passed, and a lighter way to carry them.
 *
 * Everything overdue lands on today, so two bad days become one impossible one. This keeps
 * what fits beside what is already due today (the pressing ones first: high priority, then
 * the oldest), and spreads the rest over the coming days, never more than two a day and
 * never onto a day that is already full. Nothing is dropped or finished: only moved, and it
 * can be moved back. Repeating to-dos are left alone, since the next one is already on its way.
 */
export function planCatchUp(todos: Todo[], today: string, lists: TodoList[] = []): CatchUp | null {
  // A list kept off Today is not part of the day, so what slipped in it is not a pile.
  const open = todos.filter((t) => t.type === 'Task' && !t.done && !t.someday && !hiddenFromToday(t, lists))
  const slipped = open
    .filter((t) => !t.repeats && t.when && t.when < today)
    .sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || (a.when ?? '').localeCompare(b.when ?? '') || a.order - b.order)
  if (slipped.length < PILE) return null

  const load = new Map<string, number>()
  for (const t of open) if (t.when && t.when >= today) load.set(t.when, (load.get(t.when) ?? 0) + 1)
  const room = Math.max(0, DAY_LOAD - (load.get(today) ?? 0))
  const keep = slipped.slice(0, room)
  const rest = slipped.slice(room)

  const moves: CatchUpMove[] = []
  let day = 1
  let used = 0
  for (const t of rest) {
    while (day <= HORIZON && ((load.get(addDays(today, day)) ?? 0) + used >= DAY_LOAD || used >= PER_DAY)) { day++; used = 0 }
    if (day > HORIZON) break
    moves.push({ id: t.id, title: t.title, from: t.when!, to: addDays(today, day) })
    used++
  }
  return { slipped, keep, moves }
}
