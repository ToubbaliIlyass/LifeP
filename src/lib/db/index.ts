import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq } from 'drizzle-orm'
import * as schema from './schema'

const sqlite = new Database('./data/lifep.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Ensure built-in node types exist for user 1 on first load (idempotent)
const BUILTIN_TYPES = [
  { name: 'Goal',         typeSchema: { name: 'string', description: 'string', status: 'string', targetDate: 'string' } },
  { name: 'Habit',        typeSchema: { name: 'string', frequency: 'string', durationMinutes: 'number' } },
  { name: 'HabitLog',     typeSchema: { habitNodeId: 'number', date: 'string', completed: 'boolean', notes: 'string' } },
  { name: 'Task',         typeSchema: { name: 'string', status: 'string', dueDate: 'string', projectNodeId: 'number' } },
  { name: 'Project',      typeSchema: { name: 'string', description: 'string', status: 'string', dueDate: 'string' } },
  { name: 'Event',        typeSchema: { name: 'string', date: 'string', time: 'string', duration: 'number', recurring: 'string', location: 'string' } },
  { name: 'Course',       typeSchema: { name: 'string', code: 'string', semester: 'string', credits: 'number' } },
  { name: 'Assignment',   typeSchema: { name: 'string', courseNodeId: 'number', dueDate: 'string', status: 'string', grade: 'string' } },
  { name: 'Exam',         typeSchema: { name: 'string', courseNodeId: 'number', date: 'string', time: 'string', location: 'string', status: 'string', grade: 'string' } },
  { name: 'Note',         typeSchema: { title: 'string', content: 'string' } },
  { name: 'JournalEntry', typeSchema: { date: 'string', content: 'string', mood: 'string' } },
  { name: 'Concept',      typeSchema: { name: 'string', description: 'string', pattern: 'string' } },
  { name: 'TimeBlock',    typeSchema: { date: 'string', startTime: 'string', endTime: 'string' } },
] as const

for (const { name, typeSchema } of BUILTIN_TYPES) {
  const exists = db
    .select({ id: schema.nodeTypes.id })
    .from(schema.nodeTypes)
    .where(and(eq(schema.nodeTypes.userId, 1), eq(schema.nodeTypes.name, name)))
    .get()
  if (!exists) {
    db.insert(schema.nodeTypes)
      .values({ userId: 1, name, schema: typeSchema, isBuiltin: true })
      .run()
  }
}
