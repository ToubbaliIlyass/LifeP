/**
 * Registers the built-in node types, and optionally a small sample graph.
 *
 * Runs against whatever TURSO_DATABASE_URL points at, falling back to the
 * local file — the same rule the app itself uses, so seeding never silently
 * targets a different database than the one running.
 *
 *   npx tsx scripts/seed.ts            # node types only (safe, idempotent)
 *   npx tsx scripts/seed.ts --sample   # also insert the example graph
 */
import { createClient } from '@libsql/client'
import 'dotenv/config'

const userId = 1

/**
 * Every type the app knows about. The registry drives the graph's filter bar,
 * so a type missing here simply never appears there — which is exactly the
 * bug that hid Expense and HealthMetric when they were first added.
 */
const builtinTypes = [
  'Goal', 'Habit', 'Task', 'Event', 'Note', 'Project', 'Concept',
  'HabitLog', 'Course', 'Assignment', 'Exam', 'JournalEntry', 'TimeBlock',
  'HealthMetric', 'SavedView', 'Settings',
]

const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/lifep.db'
const authToken = process.env.TURSO_AUTH_TOKEN
const db = createClient({ url, ...(authToken ? { authToken } : {}) })

async function ensureUser() {
  const existing = await db.execute({ sql: 'select id from users where id = ?', args: [userId] })
  if (existing.rows.length === 0) {
    await db.execute({ sql: "insert into users (id, name) values (?, 'You')", args: [userId] })
    console.log(`Created user ${userId}`)
  } else {
    console.log(`User ${userId} already exists`)
  }
}

async function ensureNodeTypes() {
  let added = 0
  for (const name of builtinTypes) {
    const existing = await db.execute({
      sql: 'select id from node_types where user_id = ? and name = ?',
      args: [userId, name],
    })
    if (existing.rows.length === 0) {
      await db.execute({
        sql: "insert into node_types (user_id, name, schema, is_builtin) values (?, ?, '{}', 1)",
        args: [userId, name],
      })
      added++
    }
  }
  console.log(`Built-in node types: ${builtinTypes.length} total, ${added} added`)
}

async function seedSampleGraph() {
  const node = async (type: string, properties: Record<string, unknown>) => {
    const r = await db.execute({
      sql: 'insert into nodes (user_id, type, properties) values (?, ?, ?) returning id',
      args: [userId, type, JSON.stringify(properties)],
    })
    return Number(r.rows[0].id)
  }
  const edge = (sourceId: number, targetId: number, type: string) =>
    db.execute({
      sql: "insert into edges (user_id, source_id, target_id, type, properties) values (?, ?, ?, ?, '{}')",
      args: [userId, sourceId, targetId, type],
    })

  // `name` throughout — the app reads `name` and only falls back to `title`,
  // and seeding the wrong key is what once made a goal render as "Goal #1".
  const goal = await node('Goal', { name: 'Get fit', description: 'Build a consistent workout routine.', status: 'active' })
  const habit1 = await node('Habit', { name: 'Morning run', frequency: 'daily', durationMinutes: 30 })
  const habit2 = await node('Habit', { name: 'Drink 2L water', frequency: 'daily' })
  const task = await node('Task', { name: 'Buy running shoes', status: 'todo', priority: 'medium' })

  await edge(habit1, goal, 'supports')
  await edge(habit2, goal, 'supports')
  await edge(task, habit1, 'enables')

  console.log(`Sample graph: Goal(${goal}), Habit(${habit1}), Habit(${habit2}), Task(${task}) + 3 edges`)
}

async function main() {
  console.log(`Seeding ${url.startsWith('file:') ? 'local file' : 'Turso'}…`)
  await ensureUser()
  await ensureNodeTypes()

  if (process.argv.includes('--sample')) {
    await seedSampleGraph()
  } else {
    console.log('Skipped sample graph (pass --sample to insert it)')
  }
  console.log('Done')
}

main().catch((e) => {
  console.error('Seed failed:', e.message)
  process.exit(1)
})
