/**
 * One-shot migration of the local SQLite database into Turso.
 *
 * Copies rows with bound parameters rather than replaying a `sqlite3 .dump`.
 * Two reasons: the app's JSON export omits the users and proposals tables and
 * would let the database reassign primary keys on insert (silently
 * catastrophic — edges reference nodes by id, and properties carry their own
 * references like habitNodeId, none of which would be rewritten to match);
 * and a text dump has to survive SQL escaping, which modern sqlite3 now does
 * with `unistr()`, a function libSQL's SQLite build does not have.
 *
 * Binding values sidesteps both problems: ids are written explicitly, and no
 * value is ever re-parsed as SQL text.
 *
 * Safe to re-run with --force: it drops and rebuilds the tables.
 *
 *   npx tsx scripts/migrate-to-turso.ts [--force]
 */
import { createClient } from '@libsql/client'
import Database from 'better-sqlite3'
import { join } from 'path'
import 'dotenv/config'

const LOCAL = join(process.cwd(), 'data', 'lifep.db')

/** Parent → child, so foreign keys are always satisfiable as we go. */
const TABLES = ['users', 'nodes', 'node_types', 'proposals', 'edges']

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env')
  process.exit(1)
}

const remote = createClient({ url, authToken })
const local = new Database(LOCAL, { readonly: true })

async function main() {
  const existing = await remote.execute(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%'",
  )
  const found = existing.rows.map((r) => String(r.name))

  if (found.length > 0 && !process.argv.includes('--force')) {
    console.error(`Turso already has tables: ${found.join(', ')}`)
    console.error('Re-run with --force to drop and reload them.')
    process.exit(1)
  }

  if (found.length > 0) {
    console.log('Dropping existing tables…')
    // Child-first, so no drop trips over a foreign key still pointing at it.
    for (const t of [...TABLES].reverse()) {
      await remote.execute(`DROP TABLE IF EXISTS \`${t}\``)
    }
  }

  // Schema comes from the local database's own sqlite_master, so the remote
  // definitions are exactly the ones the app has been running against.
  console.log('Creating schema…')
  for (const table of TABLES) {
    const row = local
      .prepare("select sql from sqlite_master where type='table' and name=?")
      .get(table) as { sql?: string } | undefined
    if (!row?.sql) throw new Error(`local table ${table} not found`)
    await remote.execute(row.sql)
  }

  console.log('Copying rows…')
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    const rows = local.prepare(`select * from \`${table}\``).all() as Record<string, unknown>[]
    counts[table] = rows.length
    if (rows.length === 0) continue

    const cols = Object.keys(rows[0])
    const sql = `insert into \`${table}\` (${cols.map((c) => `\`${c}\``).join(',')}) values (${cols.map(() => '?').join(',')})`

    // One transactional batch per table: a table either lands whole or not
    // at all, and nothing is left half-copied.
    await remote.batch(
      rows.map((r) => ({ sql, args: cols.map((c) => r[c] as never) })),
      'write',
    )
  }

  console.log('\nVerifying against local:')
  let mismatch = false
  for (const table of TABLES) {
    const res = await remote.execute(`select count(*) as c from \`${table}\``)
    const remoteCount = Number(res.rows[0].c)
    const same = remoteCount === counts[table]
    if (!same) mismatch = true
    console.log(`  ${table.padEnd(12)} local ${String(counts[table]).padStart(3)}  →  turso ${String(remoteCount).padStart(3)}  ${same ? '✓' : '✗ MISMATCH'}`)
  }

  // Indexes last: they need only their own table, and a missing index is a
  // performance problem rather than a correctness one, so it must not be able
  // to fail the data copy.
  console.log('\nRecreating indexes…')
  const indexes = local
    .prepare("select sql from sqlite_master where type='index' and sql is not null")
    .all() as { sql: string }[]
  for (const { sql } of indexes) await remote.execute(sql)
  console.log(`  ${indexes.length} indexes`)

  console.log(mismatch ? '\n! row counts do not match — investigate' : '\n✓ migration complete')
  process.exit(mismatch ? 1 : 0)
}

main().catch((e) => {
  console.error('Migration failed:', e.message)
  process.exit(1)
})
