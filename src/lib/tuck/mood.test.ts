import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Todo } from '@/lib/todos'
import { pickMood } from './mood'
import { levelFor } from './states'

const todo = (over: Partial<Todo>): Todo => ({
  id: 1, type: 'Task', title: 'x', notes: '', when: '2026-10-27', evening: false, someday: false, deadline: null, time: null,
  timePlanned: false, minutes: null, tags: [], checklist: [], listId: null, headingId: null, done: false, doneAt: null,
  order: 0, repeats: null, repeatDays: null, reminder: null, priority: null, ...over,
})
const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m)
const base = { lists: [], events: [] }

test('a to-do that has sat for a week is offered help, not blame', () => {
  const m = pickMood({ ...base, now: at(14), todos: [todo({ when: '2026-10-10' })] })
  assert.equal(m?.state, 'stuck-helper')
  assert.equal(m?.action?.kind, 'break-down')
  assert.doesNotMatch(m!.line, /miss|overdue|behind/i)
})

test('the rest is quiet: greetings, nudges and "all clear" are not cards any more', () => {
  const calm = [todo({ id: 1, done: true, doneAt: at(9).toISOString() }), todo({ id: 2 })]
  for (const hour of [2, 8, 15, 23]) assert.equal(pickMood({ ...base, now: at(hour), todos: calm }), null, `${hour}:00`)
  assert.equal(pickMood({ ...base, now: at(14, 10), todos: [todo({ time: '14:30' })] }), null, 'what is coming up is the Now card')
  assert.equal(pickMood({ ...base, now: at(14), todos: [todo({ done: true, doneAt: at(9).toISOString() })] }), null)
})

test('growth stages', () => {
  assert.equal(levelFor(0), 'seed')
  assert.equal(levelFor(10), 'sprout')
  assert.equal(levelFor(100), 'bloom')
})
