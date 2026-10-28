import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveOccurrence, resolvedOf, statusOn, RESOLVED_KEEP } from './event-status'
import { buildTodos, type Todo } from './todos'
import { remindersIn } from './reminders'
import { dayFacts, momentFor, pickMood } from './tuck/mood'
import type { Node } from './db/schema'

const TODAY = '2026-10-13' // a Tuesday
const TOMORROW = '2026-10-14'

let nextId = 1
const node = (properties: Record<string, unknown>, type = 'Event'): Node => ({
  id: nextId++, userId: 1, type, properties, createdAt: '2026-10-01 08:00:00', updatedAt: '2026-10-12T09:00:00.000Z',
})
const view = (nodes: Node[]) => buildTodos({ date: TODAY, nodes, edges: [] })
const dentist = (over: Record<string, unknown> = {}) => ({ name: 'Dentist', date: TODAY, time: '15:00', duration: 60, frequency: 'once', ...over })
const class_ = (over: Record<string, unknown> = {}) => dentist({ name: 'Compilers', date: '2026-10-01', frequency: 'daily', ...over })
const at = (h: number) => new Date(2026, 9, 13, h, 0)
const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 900, type: 'Task', title: 'x', notes: '', when: TODAY, evening: false, someday: false, deadline: null, time: null,
  timePlanned: false, minutes: null, tags: [], checklist: [], listId: null, headingId: null, done: false, doneAt: null,
  order: 0, repeats: null, repeatDays: null, reminder: null, priority: null, streak: null, ...over,
})
const todays = (ns: Node[]) => view(ns).events.filter((e) => e.date === TODAY)
const active = (ns: Node[]) => todays(ns).filter((e) => !e.status)

test('resolving takes the event off today\'s active list and files it as settled', () => {
  const e = node(dentist())
  assert.equal(active([e]).length, 1)
  const after = node(resolveOccurrence(e.properties as Record<string, unknown>, TODAY, 'attended'))
  assert.equal(active([after]).length, 0)
  assert.equal(todays([after])[0].status, 'attended')
})

test('an empty day: every to-do and event settled', () => {
  const nodes = [node(dentist()), node(class_({ time: '10:00' }))]
  const settle = (n: Node, s: 'attended' | 'cancelled') => node(resolveOccurrence(n.properties as Record<string, unknown>, TODAY, s))
  const half = view([settle(nodes[0], 'attended'), nodes[1]]).events
  const f1 = dayFacts({ now: at(14), todos: [todo({ done: true, doneAt: at(9).toISOString() })], lists: [], events: half, daysAway: 0 })
  assert.equal(f1.openEvents, 1)
  assert.notEqual(pickMood({ now: at(14), todos: [todo({ done: true, doneAt: at(9).toISOString() })], lists: [], events: half, daysAway: 0 })?.state, 'all-done')
  const all = view([settle(nodes[0], 'attended'), settle(nodes[1], 'cancelled')]).events
  const input = { now: at(14), todos: [todo({ done: true, doneAt: at(9).toISOString() })], lists: [], events: all, daysAway: 0 }
  assert.equal(dayFacts(input).openEvents, 0)
  assert.equal(pickMood(input)?.state, 'all-done')
  // Events alone, even all cancelled, clear the day.
  assert.equal(pickMood({ ...input, todos: [] })?.state, 'all-done')
  // And the moment of settling the last one reads as all-done too.
  const before = dayFacts({ ...input, events: half })
  assert.equal(momentFor(todo(), before, dayFacts(input))?.state, 'all-done')
})

test('undo puts it back exactly as it was', () => {
  const p = dentist() as Record<string, unknown>
  const done = resolveOccurrence(p, TODAY, 'missed')
  assert.equal(statusOn(done, TODAY), 'missed')
  const back = resolveOccurrence(done, TODAY, null)
  assert.deepEqual(back, p)
  assert.equal(active([node(back)]).length, 1)
})

test('a repeating event is resolved for that day only', () => {
  const e = node(resolveOccurrence(class_() as Record<string, unknown>, TODAY, 'cancelled'))
  const { events } = view([e])
  assert.equal(events.find((x) => x.date === TODAY)?.status, 'cancelled')
  assert.equal(events.find((x) => x.date === TOMORROW)?.status, null)
  assert.equal(events.filter((x) => x.date > TODAY && !x.status).length > 0, true)
  assert.equal((e.properties as Record<string, unknown>).frequency, 'daily', 'the series itself is untouched')
})

test('not attending never reaches streaks or growth', () => {
  const nodes = (s: 'cancelled' | 'missed') => [node(resolveOccurrence(dentist() as Record<string, unknown>, TODAY, s))]
  const input = (s: 'cancelled' | 'missed' | 'attended') => ({
    now: at(14), lists: [], daysAway: 0, events: view([node(resolveOccurrence(dentist() as Record<string, unknown>, TODAY, s))]).events,
    todos: [todo({ type: 'Habit', streak: 2, done: true, doneAt: at(8).toISOString() })],
  })
  const base = dayFacts({ ...input('cancelled'), events: [] })
  for (const s of ['cancelled', 'missed', 'attended'] as const) {
    const f = dayFacts(input(s))
    assert.equal(f.finished, base.finished, `${s}: finished to-dos (growth level) unchanged`)
    assert.equal(f.streak, base.streak, `${s}: streak unchanged`)
    assert.equal(f.doneToday, base.doneToday, `${s}: not counted as a ticked to-do`)
    assert.equal(f.level, base.level)
    assert.equal(f.overdue, 0)
  }
  void nodes
})

test('no guilt in the words: nothing says missed or failed', () => {
  const input = { now: at(14), lists: [], daysAway: 0, todos: [], events: view([node(resolveOccurrence(dentist() as Record<string, unknown>, TODAY, 'missed'))]).events }
  assert.doesNotMatch(pickMood(input)!.line, /miss|fail|skip|behind/i)
})

test('a settled event no longer reminds; the next day of a series still does', () => {
  const series = node(class_({ reminder: '09:00', remindBefore: 30 }))
  assert.ok(remindersIn(view([series])).some((r) => r.at.startsWith(TODAY)))
  const done = node(resolveOccurrence(series.properties as Record<string, unknown>, TODAY, 'attended'))
  const rs = remindersIn(view([done]))
  assert.equal(rs.some((r) => r.at.startsWith(TODAY)), false)
  assert.equal(rs.some((r) => r.at.startsWith(TOMORROW)), true)
})

test('a snooze for the settled day is dropped', () => {
  const p = resolveOccurrence(dentist({ snoozedUntil: `${TODAY}T14:00` }) as Record<string, unknown>, TODAY, 'cancelled')
  assert.equal('snoozedUntil' in p, false)
})

test('malformed stored values are ignored, and old days are trimmed', () => {
  assert.deepEqual(resolvedOf({ resolved: { '2026-10-13': 'attended', bad: 'attended', '2026-10-14': 'nope' } }), { '2026-10-13': 'attended' })
  assert.deepEqual(resolvedOf({ resolved: [1] }), {})
  let p: Record<string, unknown> = {}
  for (let i = 0; i < RESOLVED_KEEP + 5; i++) p = resolveOccurrence(p, `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, 'attended')
  assert.equal(Object.keys(p.resolved as object).length, RESOLVED_KEEP)
})
