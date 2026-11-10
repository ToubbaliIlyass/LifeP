import { createClient } from '@libsql/client'
import { AsyncLocalStorage } from 'node:async_hooks'
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

/*
 * Transactions.
 *
 * Every query function in the app reaches the database through getDb(), not
 * through `db` directly. Outside a transaction that IS `db`; inside
 * inTransaction() it is the open transaction, so a whole batch of writes made
 * by ordinary query functions commits together or not at all, with nothing
 * visible to anyone else until it does. The transaction is carried by
 * AsyncLocalStorage, so no function has to be handed it.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
const scope = new AsyncLocalStorage<Tx>()

export function getDb(): typeof db {
  return (scope.getStore() ?? db) as unknown as typeof db
}

/** Runs `fn` as one all-or-nothing unit. If it throws, every write inside is undone by the database. Nests: an inner call joins the outer one. */
export async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return fn()
  return db.transaction((tx) => scope.run(tx, fn))
}
