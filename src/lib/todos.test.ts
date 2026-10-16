import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTodos } from './todos'
import { counts, inInbox, isAnytime, isSomeday, isToday, isUpcoming } from './todo-views'
import type { Edge, Node } from './db/schema'

const TODAY = '2026-10-13' // a Tuesday

let nextId = 1
const node = (type: string, properties: Record<string, unknown>): Node => ({
  id: nextId++, userId: 1, type, properties, createdAt: '2026-10-01 08:00:00', updatedAt: '2026-10-12T09:00:00.000Z',
})
const edge = (sourceId: number, targetId: number, type = 'part-of'): Edge => ({
  id: nextId++, userId: 1, sourceId, targetId, type, properties: {}, createdAt: '2026-10-01 08:00:00',
})

test('a task lands in exactly the list its fields say', () => {
  const project = node('Project', { name: 'Thesis', status: 'active' })
  const loose = node('Task', { name: 'Loose', status: 'todo' })
  const today = node('Task', { name: 'Today', status: 'todo', dueDate: TODAY })
  const late = node('Task', { name: 'From last week', status: 'todo', dueDate: '2026-10-06' })
  const later = node('Task', { name: 'Friday', status: 'todo', dueDate: '2026-10-16' })
  const due = node('Task', { name: 'Deadline only', status: 'todo', deadline: TODAY })
  const parked = node('Task', { name: 'Learn piano', status: 'todo', someday: true, dueDate: TODAY })
  const filed = node('Task', { name: 'Chapter 2', status: 'todo' })

  const { todos, lists } = buildTodos({
    date: TODAY,
    nodes: [project, loose, today, late, later, due, parked, filed],
    edges: [edge(filed.id, project.id)],
  })
  const t = (n: Node) => todos.find((x) => x.id === n.id)!

  assert.ok(inInbox(t(loose)))
  assert.ok(isToday(t(today), TODAY))
  assert.ok(isToday(t(late), TODAY), 'a day already gone stays on Today rather than vanishing')
  assert.ok(isUpcoming(t(later), TODAY) && !isToday(t(later), TODAY))
  assert.ok(isToday(t(due), TODAY), 'a deadline that has arrived is on Today')
  assert.ok(isSomeday(t(parked)) && !isToday(t(parked), TODAY), 'someday wins over a leftover date')
  assert.equal(t(filed).listId, project.id)
  assert.ok(isAnytime(t(filed), TODAY) && !inInbox(t(filed)))

  // Undecided things stay in the Inbox even once a deadline puts them on Today too.
  assert.deepEqual(counts(todos, lists, TODAY), { inbox: 2, today: 3, due: 1 })
})

test('a habit is a to-do on the days it is due, with its streak', () => {
  const daily = node('Habit', { name: 'Read', frequency: 'daily' })
  const friday = node('Habit', { name: 'Review', frequency: 'weekly', daysOfWeek: [5] })
  const logs = ['2026-10-10', '2026-10-11', '2026-10-12'].map((date) => node('HabitLog', { habitNodeId: daily.id, date, completed: true }))

  const { todos } = buildTodos({ date: TODAY, nodes: [daily, friday, ...logs], edges: [] })
  const read = todos.find((t) => t.id === daily.id)!
  const review = todos.find((t) => t.id === friday.id)!

  assert.equal(read.when, TODAY)
  assert.equal(read.done, false)
  assert.equal(read.streak, 3, 'not yet done today does not break the streak')
  assert.ok(isToday(read, TODAY))
  assert.equal(review.when, null)
  assert.ok(!isToday(review, TODAY))
})

test('prayers replace the habit they tick off, and planned blocks give a time', () => {
  const prayerHabit = node('Habit', { name: 'Pray', frequency: 'daily' })
  const task = node('Task', { name: 'Lab report', status: 'todo', dueDate: TODAY })
  const block = node('TimeBlock', { date: TODAY, startTime: '10:30', endTime: '11:30' })

  const { todos } = buildTodos({
    date: TODAY,
    nodes: [prayerHabit, task, block],
    edges: [edge(block.id, task.id, 'scheduled-for')],
    prayers: [{ key: 'fajr', label: 'Fajr', time: '06:10', done: true }, { key: 'dhuhr', label: 'Dhuhr', time: '13:20', done: false }],
    prayerHabitId: prayerHabit.id,
  })

  assert.ok(!todos.some((t) => t.id === prayerHabit.id))
  assert.deepEqual(todos.filter((t) => t.type === 'Prayer').map((t) => [t.id, t.time, t.done]), [[-1, '06:10', true], [-2, '13:20', false]])
  assert.equal(todos.find((t) => t.id === task.id)!.time, '10:30')
})

test('events are listed per day for the week ahead, not as to-dos', () => {
  const weekly = node('Event', { name: 'Class', date: '2026-09-01', time: '14:00', duration: 90, frequency: 'weekly', daysOfWeek: [2, 4] })
  const far = node('Event', { name: 'Flight', date: '2026-12-01', time: '07:00' })

  const { events, todos } = buildTodos({ date: TODAY, nodes: [weekly, far], edges: [] })
  assert.equal(todos.length, 0)
  assert.deepEqual(events.map((e) => [e.title, e.date, e.endTime]), [
    ['Class', '2026-10-13', '15:30'],
    ['Class', '2026-10-15', '15:30'],
    ['Class', '2026-10-20', '15:30'],
    ['Flight', '2026-12-01', '08:00'],
  ])
})
