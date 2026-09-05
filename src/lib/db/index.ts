import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

/**
 * libSQL speaks SQLite, so the schema and every query carry over from
 * better-sqlite3 unchanged — only the driver differs. It also accepts a
 * local `file:` URL, which means the exact same code path runs against the
 * local database in development and against Turso in production; the only
 * thing that changes between them is this URL.
 *
 * The one thing that does NOT carry over is synchronousness. better-sqlite3
 * could read a local file synchronously; anything over a network cannot, so
 * every query in this app is async — see src/lib/graph/queries.ts.
 */
const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/lifep.db'
const authToken = process.env.TURSO_AUTH_TOKEN

if (process.env.TURSO_DATABASE_URL && !authToken) {
  // Failing loudly here beats a confusing auth error on every single query.
  console.warn('[db] TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing')
}

const client = createClient({ url, ...(authToken ? { authToken } : {}) })

export const db = drizzle(client, { schema })

/*
 * The built-in node types used to be inserted by a loop that ran at module
 * scope, on import. That cannot work against an async client, and on
 * serverless it would run on every cold start of every function. Seeding
 * belongs in `npm run db:seed`, which is idempotent and already maintains
 * the same list.
 */
