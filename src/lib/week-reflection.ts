import type { Todo, TodoList } from '@/lib/todos'
import { addDays, localDateStr } from '@/lib/date'

export interface WeekLook {
  /** Everything finished in the last seven days, today included. */
  done: number
  /** Days of those seven with at least one thing finished. */
  activeDays: number
  /** The weekday with the most, when there was one. */
  busiest: string | null
  /** The list the most got done in, when one stands out. */
  topList: string | null
  /** Still open and past their day. */
  slipped: number
}

/** The days, newest last, that the last seven cover. */
export function lastSeven(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
}

/** How many of the last seven days had something finished: the rhythm, with no streak to break. */
export function activeDaysOf(todos: Todo[], today: string): number {
  const days = new Set(lastSeven(today))
  const hit = new Set<string>()
  for (const t of todos) {
    if (!t.done || !t.doneAt || t.prayerKey) continue
    const d = localDateStr(new Date(t.doneAt))
    if (days.has(d)) hit.add(d)
  }
  return hit.size
}

const WEEKDAY = (date: string) => new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

/** The week, looked back on: plain counts, no scores. */
export function lookBack(todos: Todo[], lists: TodoList[], today: string): WeekLook {
  const days = new Set(lastSeven(today))
  const perDay = new Map<string, number>()
  const perList = new Map<number, number>()
  let done = 0
  for (const t of todos) {
    if (!t.done || !t.doneAt || t.prayerKey) continue
    const d = localDateStr(new Date(t.doneAt))
    if (!days.has(d)) continue
    done++
    perDay.set(d, (perDay.get(d) ?? 0) + 1)
    if (t.listId !== null) perList.set(t.listId, (perList.get(t.listId) ?? 0) + 1)
  }
  const best = [...perDay].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]
  const top = [...perList].sort((a, b) => b[1] - a[1])[0]
  const topTitle = top && top[1] >= 2 ? lists.find((l) => l.id === top[0])?.title.trim() || null : null
  const slipped = todos.filter((t) => t.type === 'Task' && !t.done && !t.someday && !t.repeats && !!t.when && t.when < today).length
  return { done, activeDays: perDay.size, busiest: best && best[1] >= 2 ? WEEKDAY(best[0]) : null, topList: topTitle, slipped }
}

/** What Tuck says first: warm at every size, and never about what was not done. */
export function weekLine(w: WeekLook): string {
  if (w.done === 0) return 'A quiet week. Those happen. Want a lighter one next?'
  if (w.activeDays >= 6) return `You showed up on ${w.activeDays} of the last 7 days. That’s a real rhythm.`
  if (w.activeDays >= 4) return `You got something done on ${w.activeDays} of the last 7 days. Steady.`
  return `${w.done} thing${w.done === 1 ? '' : 's'} done this week. That counts.`
}
