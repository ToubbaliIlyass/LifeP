import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planCatchUp } from './catch-up'
import type { Todo } from './todos'

const t = (id: number, when: string | null, extra: Partial<Todo> = {}): Todo => ({
  id, type: 'Task', title: `T${id}`, notes: '', when, evening: false, someday: false, deadline: null, time: null, timePlanned: false, minutes: null,
  tags: [], checklist: [], listId: null, headingId: null, done: false, doneAt: null, order: id, repeats: null, repeatDays: null, reminder: null, priority: null, ...extra,
} as Todo)

test('a small pile is left alone', () => {
  assert.equal(planCatchUp([t(1, '2026-03-01'), t(2, '2026-03-02')], '2026-03-05'), null)
})

test('a pile keeps what fits today and spreads the rest, two a day, oldest and high priority first', () => {
  const todos = [t(1, '2026-03-01'), t(2, '2026-03-02'), t(3, '2026-03-03', { priority: 'high' }), t(4, '2026-03-03'), t(5, '2026-03-04'), t(6, '2026-03-04'), t(7, '2026-03-04')]
  const r = planCatchUp(todos, '2026-03-05')!
  assert.deepEqual(r.keep.map((x) => x.id), [3, 1, 2], 'high priority first, then oldest; three fit')
  assert.deepEqual(r.moves.map((m) => [m.id, m.to]), [[4, '2026-03-06'], [5, '2026-03-06'], [6, '2026-03-07'], [7, '2026-03-07']])
})

test('what is already due today, and on the coming days, counts; repeats and done things do not move', () => {
  const todos = [t(1, '2026-03-01'), t(2, '2026-03-01'), t(3, '2026-03-01'), t(4, '2026-03-01'), t(10, '2026-03-05'), t(11, '2026-03-05'), t(12, '2026-03-06'), t(13, '2026-03-06'), t(14, '2026-03-06'), t(20, '2026-03-01', { repeats: 'daily' }), t(21, '2026-03-01', { done: true })]
  const r = planCatchUp(todos, '2026-03-05')!
  assert.deepEqual(r.keep.map((x) => x.id), [1], 'two are due today already, so one more fits')
  assert.deepEqual(r.moves.map((m) => [m.id, m.to]), [[2, '2026-03-07'], [3, '2026-03-07'], [4, '2026-03-08']], 'tomorrow is full')
})
