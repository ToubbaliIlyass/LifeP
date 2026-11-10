/**
 * One-off: turns Habit and HabitLog nodes into repeating to-dos.
 *
 *   npx tsx scripts/migrate-habits-to-tasks.ts                 # data/test.db, the local test account
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/migrate-habits-to-tasks.ts --yes-real
 *
 * Refuses any database but ./data/test.db unless --yes-real is given. What it
 * removes is first written to data/backups/habits-<date>.json. See
 * src/lib/migrate-habits.ts for what becomes what.
 */
import { createClient } from '@libsql/client'
import { mkdirSync, writeFileSync } from 'node:fs'
import { migrateHabits } from '../src/lib/migrate-habits'

const DEFAULT_URL = 'file:./data/test.db'
const url = process.env.TURSO_DATABASE_URL || DEFAULT_URL
if (url !== DEFAULT_URL && !process.argv.includes('--yes-real')) {
  console.error(`Refusing to touch ${url}. Pass --yes-real if that is what you mean.`)
  process.exit(1)
}

const client = createClient({ url, ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}) })
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

async function main() {
  const result = await migrateHabits(client, today, (backup) => {
    mkdirSync('data/backups', { recursive: true })
    const file = `data/backups/habits-${today}.json`
    writeFileSync(file, JSON.stringify(backup, null, 2))
    console.log(`Backed up ${backup.nodes.length} nodes and ${backup.edges.length} edges to ${file}`)
  })
  console.log(url, { tasksMade: result.tasksMade, prayerDaysKept: result.prayerDaysKept, habitsDeleted: result.habitsDeleted, logsDeleted: result.logsDeleted })
}

main().catch((e) => { console.error(e); process.exit(1) })
