import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeDaysOf, lookBack, weekLine } from './week-reflection'
import type { Todo, TodoList } from './todos'

const at = (date: string) => `${date}T12:00:00`
const t = (id: number, doneOn: string | null, extra: Partial<Todo> = {}): Todo => ({
  id, type: 'Task', title: `T${id}`, notes: '', when: null, evening: false, someday: false, deadline: null, time: null, timePlanned: false, minutes: null,
  tags: [], checklist: [], listId: null, headingId: null, done: !!doneOn, doneAt: doneOn ? at(doneOn) : null, order: id, repeats: null, repeatDays: null, reminder: null, priority: null, ...extra,
} as Todo)
const list = (id: number, title: string) => ({ id, title } as TodoList)

test('active days counts distinct days in the last seven, not things, and not older ones', () => {
  const todos = [t(1, '2026-03-10'), t(2, '2026-03-10'), t(3, '2026-03-08'), t(4, '2026-03-01'), t(5, null)]
  assert.equal(activeDaysOf(todos, '2026-03-12'), 2)
})

test('the look back names the busiest day and the list that got the most, only when they stand out', () => {
  const todos = [t(1, '2026-03-10', { listId: 7 }), t(2, '2026-03-10', { listId: 7 }), t(3, '2026-03-11'), t(4, '2026-03-12', { when: '2026-03-01' })]
  const w = lookBack(todos, [list(7, 'Marathon')], '2026-03-12')
  assert.equal(w.done, 4)
  assert.equal(w.activeDays, 3)
  assert.equal(w.busiest, 'Tuesday')
  assert.equal(w.topList, 'Marathon')
  assert.equal(lookBack([t(1, '2026-03-12', { listId: 7 })], [list(7, 'X')], '2026-03-12').topList, null)
})

test('the line is warm at every size', () => {
  assert.match(weekLine({ done: 0, activeDays: 0, busiest: null, topList: null, slipped: 0 }), /quiet week/)
  assert.match(weekLine({ done: 9, activeDays: 4, busiest: null, topList: null, slipped: 0 }), /4 of the last 7/)
  assert.match(weekLine({ done: 2, activeDays: 2, busiest: null, topList: null, slipped: 0 }), /2 things/)
})
