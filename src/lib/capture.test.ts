import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCaptureNodes, fallbackCapture, type CapturedItem } from './capture'

const today = '2026-09-28'
const item = (over: Partial<CapturedItem>): CapturedItem => ({
  kind: 'task', name: 'thing', date: null, time: null, minutes: null, urgent: false, ...over,
})

test('a loose sentence becomes tasks for today and an event at its time', () => {
  const nodes = toCaptureNodes([
    item({ name: 'Finish lab report', minutes: 120, urgent: true }),
    item({ name: 'Call the bank' }),
    item({ kind: 'event', name: 'Dentist', time: '15:00' }),
  ], { today, openTasks: [] })

  assert.deepEqual(nodes.map((n) => n.type), ['Task', 'Task', 'Event'])
  assert.deepEqual(nodes[0].properties, { name: 'Finish lab report', dueDate: today, estimatedMinutes: 120, priority: 'high' })
  assert.equal(nodes[1].properties.estimatedMinutes, 30)
  assert.equal(nodes[1].properties.priority, undefined)
  assert.deepEqual(nodes[2].properties, { name: 'Dentist', date: today, time: '15:00', duration: 60 })
})

test('an event with no readable time is a task', () => {
  const [n] = toCaptureNodes([item({ kind: 'event', name: 'Meet Sara', time: 'afternoon' })], { today, openTasks: [] })
  assert.equal(n.type, 'Task')
})

test('a day already gone, or garbage, means today; a later day is kept', () => {
  const nodes = toCaptureNodes([
    item({ name: 'a', date: '2026-09-01' }),
    item({ name: 'b', date: 'tomorrow' }),
    item({ name: 'c', date: '2026-09-29' }),
  ], { today, openTasks: [] })
  assert.deepEqual(nodes.map((n) => n.properties.dueDate), [today, today, '2026-09-29'])
})

test('absurd lengths are made plannable', () => {
  const nodes = toCaptureNodes([
    item({ name: 'a', minutes: -5 }),
    item({ name: 'b', minutes: 5000 }),
    item({ name: 'c', minutes: NaN }),
  ], { today, openTasks: [] })
  assert.deepEqual(nodes.map((n) => n.properties.estimatedMinutes), [30, 480, 30])
})

test('said twice is one item, and an open task is moved rather than copied', () => {
  const nodes = toCaptureNodes([
    item({ name: 'Call the bank.' }),
    item({ name: 'call  the bank' }),
    item({ name: 'Groceries', date: '2026-09-29' }),
  ], { today, openTasks: [{ id: 7, name: 'groceries' }] })
  assert.equal(nodes.length, 2)
  assert.equal(nodes[0].properties.name, 'Call the bank')
  assert.equal(nodes[1].existingId, 7)
  assert.equal(nodes[1].properties.dueDate, '2026-09-29')
})

test('nothing said is lost when reading fails', () => {
  assert.deepEqual(fallbackCapture('  buy   milk and eggs ', today), [
    { type: 'Task', properties: { name: 'buy milk and eggs', dueDate: today, estimatedMinutes: 30 } },
  ])
  assert.deepEqual(fallbackCapture('   ', today), [])
})
