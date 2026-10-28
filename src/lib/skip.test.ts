import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skipOccurrence, unskipOccurrence, skipsOf, SKIP_KEEP } from './skip'
import { buildTodos } from './todos'
import { canSkip, counts, isToday, skipLabel, skipPreview } from './todo-views'
import { remindersIn } from './reminders'
import type { Node } from './db/schema'

const TODAY = '2026-10-13' // a Tuesday

let nextId = 1
const node = (properties: Record<string, unknown>): Node => ({
  id: nextId++, userId: 1, type: 'Task', properties, createdAt: '2026-10-01 08:00:00', updatedAt: '2026-10-12T09:00:00.000Z',
})
const daily = (over: Record<string, unknown> = {}) => ({
  name: 'Stretch', status: 'todo', dueDate: TODAY, recurrence: { frequency: 'daily' }, ...over,
})
const view = (n: Node) => buildTodos({ date: TODAY, nodes: [n], edges: [] })
const skipped = (p: Record<string, unknown>, today = TODAY, expected?: string) => {
  const r = skipOccurrence(p, today, expected)
  assert.ok(r.ok, 'expected the skip to work')
  return r
}

test('skipping hides today and the next occurrence appears', () => {
  const before = node(daily({ reminder: '09:00' }))
  assert.ok(isToday(view(before).todos[0], TODAY))
  assert.equal(remindersIn(view(before)).length, 1)

  const r = skipped(before.properties as Record<string, unknown>)
  assert.equal(r.from, TODAY)
  assert.equal(r.to, '2026-10-14')
  const after = node(r.props)
  const [t] = view(after).todos
  assert.ok(!isToday(t, TODAY), 'gone from Today')
  assert.equal(t.when, '2026-10-14')
  assert.equal(counts([t], [], TODAY).today, 0, 'and from the sidebar count')
  assert.equal(remindersIn({ todos: [t], events: [] }).every((x) => x.at.startsWith('2026-10-14')), true, 'its reminder moves to the next occurrence')
})

test('the next occurrence follows the rule, not just tomorrow', () => {
  // Tuesday + Thursday: skipping Tuesday lands on Thursday.
  const tt = { name: 'Class notes', status: 'todo', dueDate: TODAY, recurrence: { frequency: 'weekly', daysOfWeek: [2, 4] } }
  assert.equal(skipped(tt).to, '2026-10-15')
  // Weekdays on a Friday goes over the weekend.
  const fri = { ...daily(), dueDate: '2026-10-16', recurrence: { frequency: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5] } }
  assert.equal(skipped(fri, '2026-10-16').to, '2026-10-19')
})

test('skipping does not complete anything or count as a miss', () => {
  const r = skipped(daily())
  assert.equal(r.props.status, 'todo')
  assert.equal('completedAt' in r.props, false)
  const [t] = view(node(r.props)).todos
  assert.equal(t.done, false)
  assert.equal(t.doneAt, null)
  // The only trace is the node's own memory of it; nothing is written to the
  // signal log the rhythm and streaks read from (the route never calls recordDone).
  assert.deepEqual(skipsOf(r.props), [{ from: TODAY, to: '2026-10-14' }])
})

test('undo puts it back exactly, and only while it is still where the skip left it', () => {
  const original = daily()
  const r = skipped(original)
  const back = unskipOccurrence(r.props, TODAY)
  assert.ok(back.ok)
  assert.equal(back.props.dueDate, TODAY)
  assert.equal('skipped' in back.props, false)
  assert.deepEqual(back.props, original)

  // Moved by hand since: undo leaves it alone.
  const moved = unskipOccurrence({ ...r.props, dueDate: '2026-10-20' }, TODAY)
  assert.deepEqual(moved, { ok: false, reason: 'changed' })
  // Nothing to undo, or already finished.
  assert.deepEqual(unskipOccurrence(original, TODAY), { ok: false, reason: 'nothing-to-undo' })
  assert.deepEqual(unskipOccurrence({ ...r.props, status: 'done' }, TODAY), { ok: false, reason: 'changed' })
})

test('one-offs and finished or parked to-dos cannot be skipped', () => {
  const oneOff = { name: 'Dentist', status: 'todo', dueDate: TODAY }
  assert.deepEqual(skipOccurrence(oneOff, TODAY), { ok: false, reason: 'not-repeating' })
  assert.deepEqual(skipOccurrence(daily({ recurrence: { frequency: 'yearly' } }), TODAY), { ok: false, reason: 'not-repeating' })
  assert.deepEqual(skipOccurrence(daily({ status: 'done' }), TODAY), { ok: false, reason: 'finished' })
  assert.deepEqual(skipOccurrence(daily({ someday: true }), TODAY), { ok: false, reason: 'finished' })
  assert.deepEqual(skipOccurrence(daily({ dueDate: undefined }), TODAY), { ok: false, reason: 'no-day' })

  const [one] = view(node(oneOff)).todos
  assert.equal(canSkip(one), false)
  assert.equal(skipPreview(one, TODAY).ok, false)
  assert.equal(canSkip(view(node(daily())).todos[0]), true)
})

test('a second skip from a stale screen does not skip twice', () => {
  const r = skipped(daily(), TODAY, TODAY)
  assert.deepEqual(skipOccurrence(r.props, TODAY, TODAY), { ok: false, reason: 'moved' })
})

test('the last time round before a deadline has nowhere to go', () => {
  assert.deepEqual(skipOccurrence(daily({ deadline: TODAY }), TODAY), { ok: false, reason: 'last' })
  assert.equal(skipped(daily({ deadline: '2026-10-14' })).to, '2026-10-14')
})

test('an overdue occurrence is dropped; today\'s own is not skipped with it', () => {
  const r = skipped(daily({ dueDate: '2026-10-09' }))
  assert.equal(r.from, '2026-10-09')
  assert.equal(r.to, TODAY)
  // Weekly Monday task left from last week: lands on next Monday, not today.
  const mon = { ...daily({ dueDate: '2026-10-05' }), recurrence: { frequency: 'weekly', daysOfWeek: [1] } }
  assert.equal(skipped(mon).to, '2026-10-19')
})

test('skipping a later occurrence works and uses the day it is on', () => {
  const r = skipped(daily({ dueDate: '2026-10-15' }))
  assert.equal(r.to, '2026-10-16')
  assert.equal(skipLabel(view(node(daily({ dueDate: '2026-10-15' }))).todos[0], TODAY), 'Skip Thursday')
  assert.equal(skipLabel(view(node(daily())).todos[0], TODAY), 'Skip today')
})

test('skip, then a rule edit: the new rule decides what comes next', () => {
  const r = skipped(daily())
  // Edited to weekdays-only Tuesday/Thursday after the skip; the next skip follows the new rule.
  const edited = { ...r.props, recurrence: { frequency: 'weekly', daysOfWeek: [2, 4] } }
  const again = skipped(edited, '2026-10-14')
  assert.equal(again.from, '2026-10-14')
  assert.equal(again.to, '2026-10-15')
  // Undo still knows its own skip.
  assert.ok(unskipOccurrence(r.props, TODAY).ok)
})

test('a snooze or one-off reminder for the skipped occurrence goes with it; later ones stay', () => {
  const r = skipped(daily({ snoozedUntil: `${TODAY}T10:00`, remindAt: `${TODAY}T08:00` }))
  assert.equal('snoozedUntil' in r.props, false)
  assert.equal('remindAt' in r.props, false)
  assert.equal(skipped(daily({ remindAt: '2026-10-20T08:00' })).props.remindAt, '2026-10-20T08:00')
})

test('only a handful of recent skips are remembered', () => {
  let p: Record<string, unknown> = daily()
  let day = TODAY
  for (let i = 0; i < SKIP_KEEP + 5; i++) {
    const r = skipped(p, day)
    p = r.props
    day = r.to
  }
  assert.equal(skipsOf(p).length, SKIP_KEEP)
})
