import { and, count, eq, max } from 'drizzle-orm'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { db } from '@/lib/db'
import { edges, nodes, proposals } from '@/lib/db/schema'

/**
 * A fingerprint of everything the user has: it changes whenever anything
 * does — a to-do added on the phone, ticked in another tab, planned by the
 * assistant, deleted. The app asks for it every few seconds while it is on
 * screen, which costs three aggregate queries, and reloads its lists only
 * when the answer is different. That is what makes a change made anywhere
 * show up everywhere without a refresh.
 *
 * Counts catch additions and deletions; the latest update time and id catch
 * edits. Nothing in the answer says what changed — only that something did.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [n, e, p] = await Promise.all([
    db.select({ c: count(), u: max(nodes.updatedAt), i: max(nodes.id) }).from(nodes).where(eq(nodes.userId, user.id)).get(),
    db.select({ c: count(), i: max(edges.id) }).from(edges).where(eq(edges.userId, user.id)).get(),
    db.select({ c: count() }).from(proposals).where(and(eq(proposals.userId, user.id), eq(proposals.status, 'pending'))).get(),
  ])

  const v = [n?.c, n?.u, n?.i, e?.c, e?.i, p?.c].map((x) => x ?? '').join('|')
  return Response.json({ v }, { headers: { 'Cache-Control': 'no-store' } })
}
