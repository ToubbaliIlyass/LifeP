import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { migrateHabits } from './migrate-habits'

/* Against a throwaway file, never a real database. */
test('habits become repeating to-dos, the five prayers keep their days, nothing else is lost', async () => {
  const client = createClient({ url: `file:${join(mkdtempSync(join(tmpdir(), 'acture-habits-')), 'm.db')}` })
  await migrate(drizzle(client), { migrationsFolder: join(process.cwd(), 'drizzle') })
  await client.execute("insert into users (id, name) values (1, 'T')")
  const add = async (type: string, props: Record<string, unknown>) =>
    Number((await client.execute({ sql: 'insert into nodes (user_id, type, properties) values (1, ?, ?) returning id', args: [type, JSON.stringify(props)] })).rows[0].id)
  const edge = (a: number, b: number, type: string) =>
    client.execute({ sql: "insert into edges (user_id, source_id, target_id, type, properties) values (1, ?, ?, ?, '{}')", args: [a, b, type] })

  const goal = await add('Goal', { name: 'Get fit' })
  const run = await add('Habit', { name: 'Morning run', frequency: 'weekly', daysOfWeek: [1], durationMinutes: 30, tags: ['run'] })
  const pray = await add('Habit', { name: 'Pray five prayers', frequency: 'daily', anytime: true })
  const block = await add('TimeBlock', { date: '2026-11-09', startTime: '07:00', endTime: '07:30' })
  await edge(run, goal, 'supports')
  await edge(block, run, 'scheduled-for')
  await add('HabitLog', { habitNodeId: run, date: '2026-11-02', completed: true })
  await add('HabitLog', { habitNodeId: pray, date: '2026-11-08', prayers: ['fajr', 'dhuhr'], completed: false })
  await add('HabitLog', { habitNodeId: pray, date: '2026-11-07', prayers: ['fajr'], completed: false })
  const settings = await add('Settings', { prayer: { enabled: true, method: 'morocco', madhab: 'standard', habitNodeId: pray } })

  let backedUp = 0
  const r = await migrateHabits(client, '2026-11-09', (b) => { backedUp = b.nodes.length })
  assert.equal(backedUp, 5, 'everything removed was handed over before the write')
  assert.equal(r.habitsDeleted, 2)
  assert.equal(r.logsDeleted, 3)

  const nodes = (await client.execute('select id, type, properties from nodes')).rows.map((n) => ({ id: Number(n.id), type: String(n.type), p: JSON.parse(String(n.properties)) as Record<string, unknown> }))
  assert.equal(nodes.filter((n) => n.type === 'Habit' || n.type === 'HabitLog').length, 0)

  // Monday 2026-11-09 is today and the run is due on Mondays.
  const task = nodes.find((n) => n.p.name === 'Morning run')!
  assert.equal(task.type, 'Task')
  assert.equal(task.p.dueDate, '2026-11-09')
  assert.deepEqual(task.p.recurrence, { frequency: 'weekly', daysOfWeek: [1] })
  assert.equal(task.p.estimatedMinutes, 30)
  const edges = (await client.execute('select source_id, target_id, type from edges')).rows.map((e) => `${e.source_id}-${e.type}-${e.target_id}`)
  assert.ok(edges.includes(`${task.id}-supports-${goal}`), 'goal link kept')
  assert.ok(edges.includes(`${block}-scheduled-for-${task.id}`), 'calendar slot kept')

  const prayers = nodes.filter((n) => n.type === 'Task' && n.p.prayer)
  assert.equal(prayers.length, 5)
  const fajr = prayers.find((n) => n.p.prayer === 'fajr')!
  assert.deepEqual(fajr.p.doneDates, ['2026-11-07', '2026-11-08'])
  assert.deepEqual(prayers.find((n) => n.p.prayer === 'dhuhr')!.p.doneDates, ['2026-11-08'])
  assert.equal(nodes.some((n) => n.p.name === 'Pray five prayers'), false, 'the umbrella habit is not a to-do')

  const s = nodes.find((n) => n.id === settings)!
  assert.equal('habitNodeId' in (s.p.prayer as object), false)

  // Running it again finds nothing to do.
  const again = await migrateHabits(client, '2026-11-09')
  assert.equal(again.tasksMade + again.habitsDeleted + again.logsDeleted, 0)
})
