import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueReminders, lead, remindersIn, shift, snoozeUntil } from './reminders'
import type { DayEvent, Todo } from './todos'

const todo = (over: Partial<Todo>): Todo => ({
  id: 1, type: 'Task', title: 'Call mom', notes: '', when: '2026-10-18', evening: false, someday: false, deadline: null,
  time: null, timePlanned: false, minutes: null, tags: [], checklist: [], listId: null, headingId: null, done: false,
  doneAt: null, order: 0, repeats: null, repeatDays: null, reminder: null, priority: null, streak: null, ...over,
})
const event = (over: Partial<DayEvent>): DayEvent => ({
  id: 9, date: '2026-10-18', title: 'Dentist', time: '15:00', endTime: '16:00', location: 'Agdal', minutes: 60,
  frequency: 'once', daysOfWeek: null, firstDate: '2026-10-18', ...over,
})

test('moments move across midnight', () => {
  assert.equal(shift('2026-10-18T00:05', -10), '2026-10-17T23:55')
  assert.equal(shift('2026-10-18T09:00', 24 * 60), '2026-10-19T09:00')
})

test('leads read the way they are said', () => {
  assert.equal(lead(10), '10 minutes')
  assert.equal(lead(60), '1 hour')
  assert.equal(lead(90), '1 hour 30 minutes')
  assert.equal(lead(1440), '1 day')
})

test('a reminder at a time on its day', () => {
  const [r] = remindersIn({ todos: [todo({ reminder: '17:00' })], events: [] })
  assert.equal(r.at, '2026-10-18T17:00')
  assert.equal(r.key, 'todo:1:2026-10-18T17:00')
})

test('minutes before its time, including the day before', () => {
  const rs = remindersIn({ todos: [todo({ time: '09:00', remindBefore: 1440 })], events: [] })
  assert.deepEqual(rs.map((r) => r.at), ['2026-10-17T09:00'])
  assert.match(rs[0].body, /1 day/)
})

test('a moment on any day, and a snooze', () => {
  const rs = remindersIn({ todos: [todo({ when: null, remindAt: '2026-10-23T09:00', snoozedUntil: '2026-10-18T17:10' })], events: [] })
  assert.deepEqual(rs.map((r) => r.at), ['2026-10-18T17:10', '2026-10-23T09:00'])
})

test('done to-dos and prayers never remind', () => {
  assert.equal(remindersIn({ todos: [todo({ reminder: '17:00', done: true }), todo({ id: -1, type: 'Prayer', reminder: '13:00' })], events: [] }).length, 0)
})

test('events: before they start, and at a time on their day', () => {
  const rs = remindersIn({ todos: [], events: [event({ remindBefore: 30 }), event({ id: 10, date: '2026-10-20', reminder: '08:00' })] })
  assert.deepEqual(rs.map((r) => r.at), ['2026-10-18T14:30', '2026-10-20T08:00'])
  assert.match(rs[0].body, /30 minutes · 15:00 · Agdal/)
})

test('due now: arrived, recent, and not already sent', () => {
  const all = remindersIn({ todos: [todo({ reminder: '17:00' }), todo({ id: 2, reminder: '16:30' }), todo({ id: 3, reminder: '17:20' })], events: [] })
  assert.deepEqual(dueReminders(all, '2026-10-18T17:01').map((r) => r.id), [1])
  assert.deepEqual(dueReminders(all, '2026-10-18T17:01', new Set(['todo:1:2026-10-18T17:00'])).map((r) => r.id), [])
})

test('snoozes: minutes from now, or tomorrow morning', () => {
  assert.equal(snoozeUntil('2026-10-18T23:55', 10), '2026-10-19T00:05')
  assert.equal(snoozeUntil('2026-10-18T17:00', null), '2026-10-19T09:00')
})

test('an event snoozed comes back once, on the day it was snoozed to', () => {
  const rs = remindersIn({ todos: [], events: [event({ snoozedUntil: '2026-10-18T14:50' }), event({ date: '2026-10-19', snoozedUntil: '2026-10-18T14:50' })] })
  assert.deepEqual(rs.map((r) => r.at), ['2026-10-18T14:50'])
})
