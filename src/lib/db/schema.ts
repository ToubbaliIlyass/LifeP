import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

export const nodes = sqliteTable(
  'nodes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    properties: text('properties', { mode: 'json' }).notNull().default('{}'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('nodes_user_id_idx').on(t.userId),
    index('nodes_user_id_type_idx').on(t.userId, t.type),
  ],
)

export const edges = sqliteTable(
  'edges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    targetId: integer('target_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    properties: text('properties', { mode: 'json' }).notNull().default('{}'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('edges_user_id_idx').on(t.userId),
    index('edges_source_id_idx').on(t.userId, t.sourceId),
    index('edges_target_id_idx').on(t.userId, t.targetId),
  ],
)

export const nodeTypes = sqliteTable(
  'node_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    schema: text('schema', { mode: 'json' }).notNull().default('{}'),
    isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('node_types_user_id_idx').on(t.userId),
  ],
)

export const proposals = sqliteTable(
  'proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    operations: text('operations', { mode: 'json' }).notNull().default('[]'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    rejectionReason: text('rejection_reason'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    resolvedAt: text('resolved_at'),
    schemaVersion: integer('schema_version').notNull().default(0),
    executionResult: text('execution_result', { mode: 'json' }),
  },
  (t) => [
    index('proposals_user_id_idx').on(t.userId),
    index('proposals_user_id_status_idx').on(t.userId, t.status),
  ],
)

export type Proposal = typeof proposals.$inferSelect
export type NewProposal = typeof proposals.$inferInsert

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Node = typeof nodes.$inferSelect
export type NewNode = typeof nodes.$inferInsert
export type Edge = typeof edges.$inferSelect
export type NewEdge = typeof edges.$inferInsert
export type NodeType = typeof nodeTypes.$inferSelect
export type NewNodeType = typeof nodeTypes.$inferInsert
