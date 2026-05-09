import { and, eq } from 'drizzle-orm'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/lib/db/schema'

const sqlite = new Database('./data/lifep.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

const userId = 1

const builtinTypes = ['Goal', 'Habit', 'Task', 'Event', 'Note', 'Project', 'Concept']

function ensureUser() {
  const existing = db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
  if (!existing) {
    db.insert(schema.users).values({ id: userId, name: 'You' }).run()
    console.log('Created user 1')
  } else {
    console.log('User 1 already exists')
  }
}

function ensureNodeTypes() {
  for (const name of builtinTypes) {
    const existing = db
      .select()
      .from(schema.nodeTypes)
      .where(and(eq(schema.nodeTypes.userId, userId), eq(schema.nodeTypes.name, name)))
      .get()
    if (!existing) {
      db.insert(schema.nodeTypes).values({ userId, name, isBuiltin: true }).run()
    }
  }
  console.log('Seeded built-in node types')
}

function seedSampleGraph() {
  const goal = db
    .insert(schema.nodes)
    .values({
      userId,
      type: 'Goal',
      properties: { title: 'Get fit', description: 'Build a consistent workout routine.' },
    })
    .returning()
    .get()

  const habit1 = db
    .insert(schema.nodes)
    .values({ userId, type: 'Habit', properties: { title: 'Morning run', frequency: 'daily', durationMinutes: 30 } })
    .returning()
    .get()

  const habit2 = db
    .insert(schema.nodes)
    .values({ userId, type: 'Habit', properties: { title: 'Drink 2L water', frequency: 'daily' } })
    .returning()
    .get()

  const task = db
    .insert(schema.nodes)
    .values({ userId, type: 'Task', properties: { title: 'Buy running shoes', status: 'todo' } })
    .returning()
    .get()

  db.insert(schema.edges).values({ userId, sourceId: habit1.id, targetId: goal.id, type: 'supports' }).run()
  db.insert(schema.edges).values({ userId, sourceId: habit2.id, targetId: goal.id, type: 'supports' }).run()
  db.insert(schema.edges).values({ userId, sourceId: task.id, targetId: habit1.id, type: 'enables' }).run()

  console.log(`Created nodes: Goal(${goal.id}), Habit(${habit1.id}), Habit(${habit2.id}), Task(${task.id})`)
  console.log('Created 3 edges')
}

ensureUser()
ensureNodeTypes()
seedSampleGraph()
console.log('Seed complete.')
