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

test('a prayer is one repeating to-do whose time is worked out for the day', () => {
  const fajr = node('Task', { name: 'Fajr', prayer: 'fajr', recurrence: { frequency: 'daily' }, status: 'todo', doneDates: [TODAY, '2026-10-12'] })
  const dhuhr = node('Task', { name: 'Dhuhr', prayer: 'dhuhr', recurrence: { frequency: 'daily' }, status: 'todo', doneDates: ['2026-10-12'] })
  const asr = node('Task', { name: 'Asr', prayer: 'asr', recurrence: { frequency: 'daily' }, status: 'todo', doneDates: [] })
  const task = node('Task', { name: 'Lab report', status: 'todo', dueDate: TODAY })
  const block = node('TimeBlock', { date: TODAY, startTime: '10:30', endTime: '11:30' })
  const times = [{ key: 'fajr' as const, label: 'Fajr', time: '06:10' }, { key: 'dhuhr' as const, label: 'Dhuhr', time: '13:20' }]

  const { todos } = buildTodos({
    date: TODAY, nodes: [fajr, dhuhr, asr, task, block], edges: [edge(block.id, task.id, 'scheduled-for')], prayers: times,
  })

  // Done is read from today's date alone, so yesterday's prayers leave nothing overdue behind.
  assert.deepEqual(todos.filter((t) => t.prayerKey).map((t) => [t.prayerKey, t.time, t.done, t.when]), [['fajr', '06:10', true, TODAY], ['dhuhr', '13:20', false, TODAY]])
  assert.ok(todos.filter((t) => t.prayerKey).every((t) => isToday(t, TODAY) && !isAnytime(t, TODAY) && !isUpcoming(t, TODAY)))
  assert.equal(todos.find((t) => t.id === task.id)!.time, '10:30')

  // Prayers off, or no location: the five are not shown at all.
  assert.equal(buildTodos({ date: TODAY, nodes: [fajr, dhuhr, asr], edges: [] }).todos.length, 0)
  // And the next day they are open again, at that day's times.
  const next = buildTodos({ date: '2026-10-14', nodes: [fajr], edges: [], prayers: [{ key: 'fajr', label: 'Fajr', time: '06:11' }] }).todos
  assert.deepEqual(next.map((t) => [t.time, t.done]), [['06:11', false]])
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

test('a list kept off Today takes its to-dos off the day, and its projects with it, but not out of the list', () => {
  const area = node('Goal', { name: 'Work', hideFromToday: true })
  const inArea = node('Project', { name: 'Launch', status: 'active' })
  const home = node('Project', { name: 'Home', status: 'active' })
  const a = node('Task', { name: 'Ship it', status: 'todo', dueDate: TODAY })
  const b = node('Task', { name: 'Call plumber', status: 'todo', dueDate: TODAY })
  const c = node('Task', { name: 'Loose', status: 'todo', dueDate: TODAY, deadline: TODAY })
  const edges = [edge(inArea.id, area.id), edge(a.id, inArea.id), edge(b.id, home.id)]
  const { todos, lists } = buildTodos({ date: TODAY, nodes: [area, inArea, home, a, b, c], edges })
  const t = (id: number) => todos.find((x) => x.id === id)!

  assert.equal(lists.find((l) => l.id === area.id)!.hideFromToday, true)
  assert.equal(lists.find((l) => l.id === home.id)!.hideFromToday, false)
  assert.ok(!isToday(t(a.id), TODAY, lists), 'hidden through its area')
  assert.ok(isToday(t(b.id), TODAY, lists) && isToday(t(c.id), TODAY, lists))
  assert.equal(t(a.id).listId, inArea.id, 'still in its project')
  assert.ok(isAnytime(t(a.id), TODAY), 'hiding is about Today only')
  assert.deepEqual(counts(todos, lists, TODAY), { inbox: 0, today: 2, due: 1 })
})
