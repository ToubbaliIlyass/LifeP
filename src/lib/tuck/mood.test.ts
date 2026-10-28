import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Todo } from '@/lib/todos'
import { pickMood } from './mood'
import { levelFor } from './states'

const todo = (over: Partial<Todo>): Todo => ({
  id: 1, type: 'Task', title: 'x', notes: '', when: '2026-10-27', evening: false, someday: false, deadline: null, time: null,
  timePlanned: false, minutes: null, tags: [], checklist: [], listId: null, headingId: null, done: false, doneAt: null,
  order: 0, repeats: null, repeatDays: null, reminder: null, priority: null, streak: null, ...over,
})
const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m)
const base = { lists: [], events: [], daysAway: 0 }

test('a morning with things to do gets the morning pose', () => {
  assert.equal(pickMood({ ...base, now: at(8), todos: [todo({})] })?.state, 'morning-wake')
})

test('days away win, and never mention what was missed', () => {
  const m = pickMood({ ...base, now: at(14), daysAway: 5, todos: [todo({})] })
  assert.equal(m?.state, 'welcome-back')
  assert.doesNotMatch(m!.line, /miss|overdue|behind/i)
})

test('a heavy backlog gets shelter, not a count', () => {
  const todos = Array.from({ length: 6 }, (_, i) => todo({ id: i + 1, when: '2026-10-20' }))
  assert.equal(pickMood({ ...base, now: at(14), todos })?.state, 'overwhelmed-support')
})

test('everything done is all-done', () => {
  const todos = [todo({ done: true, doneAt: at(9).toISOString() })]
  assert.equal(pickMood({ ...base, now: at(14), todos })?.state, 'all-done')
})

test('a to-do about to start is a nudge', () => {
  assert.equal(pickMood({ ...base, now: at(14, 10), todos: [todo({ time: '14:30' })] })?.state, 'nudge')
})

test('a to-do that has sat for a week is offered help', () => {
  const m = pickMood({ ...base, now: at(14), todos: [todo({ when: '2026-10-10' })] })
  assert.equal(m?.state, 'stuck-helper')
  assert.equal(m?.action?.kind, 'break-down')
})

test('the small hours sleep when nothing is due', () => {
  assert.equal(pickMood({ ...base, now: at(2), todos: [] })?.state, 'deep-sleep')
  assert.equal(pickMood({ ...base, now: at(23), todos: [todo({})] })?.state, 'night-sleepy')
})

test('the afternoon says nothing unprompted once something is done', () => {
  const todos = [todo({ id: 1, done: true, doneAt: at(9).toISOString() }), todo({ id: 2 })]
  assert.equal(pickMood({ ...base, now: at(15), todos }), null)
})

test('growth stages', () => {
  assert.equal(levelFor(0), 'seed')
  assert.equal(levelFor(10), 'sprout')
  assert.equal(levelFor(100), 'bloom')
})
