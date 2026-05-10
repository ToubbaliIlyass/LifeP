import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'data', 'lifep.db')
const BACKUPS_DIR = join(process.cwd(), 'data', 'backups')
const KEEP_LAST = 30 // keep last 30 daily backups

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`)
  process.exit(1)
}

if (!existsSync(BACKUPS_DIR)) mkdirSync(BACKUPS_DIR, { recursive: true })

const date = new Date().toISOString().split('T')[0]
const dest = join(BACKUPS_DIR, `lifep-${date}.db`)
copyFileSync(DB_PATH, dest)
console.log(`✓ Backed up to ${dest}`)

// Prune old backups beyond KEEP_LAST
const backups = readdirSync(BACKUPS_DIR)
  .filter((f) => f.startsWith('lifep-') && f.endsWith('.db'))
  .map((f) => ({ name: f, mtime: statSync(join(BACKUPS_DIR, f)).mtime }))
  .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

for (const old of backups.slice(KEEP_LAST)) {
  unlinkSync(join(BACKUPS_DIR, old.name))
  console.log(`  Pruned old backup: ${old.name}`)
}
