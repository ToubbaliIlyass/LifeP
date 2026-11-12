import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { nodes } from '@/lib/db/schema'

/*
 * Archiving only sets a flag in a node's properties, in one statement per
 * batch, and leaves `updated_at` alone: for a node with no completion time
 * that is the only record of when it was finished (src/lib/archive.ts).
 */

/** SQLite caps the variables in one statement; stay well under it. */
const CHUNK = 400

async function inChunks(userId: number, ids: number[], value: ReturnType<typeof sql>) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    await getDb()
      .update(nodes)
      .set({ properties: value as never })
      .where(and(eq(nodes.userId, userId), inArray(nodes.id, ids.slice(i, i + CHUNK))))
      .run()
  }
}

/** Puts these away: out of the app's lists, still in the database. */
export async function markArchived(userId: number, ids: number[], at: string) {
  if (ids.length) await inChunks(userId, ids, sql`json_set(${nodes.properties}, '$.archivedAt', ${at})`)
}

/** Takes these out of the archive, and marks them so the daily sweep never archives them again. */
export async function markRestored(userId: number, ids: number[]) {
  if (ids.length) await inChunks(userId, ids, sql`json_remove(json_set(${nodes.properties}, '$.archiveKeep', json('true')), '$.archivedAt')`)
}
