import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { db } from '@/lib/db'
import { nodes, proposals } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST() {
  const user = getCurrentUser()
  // Edges cascade-delete via FK; proposals reference stale node ids so clear them too
  db.delete(nodes).where(eq(nodes.userId, user.id)).run()
  db.delete(proposals).where(eq(proposals.userId, user.id)).run()
  return Response.json({ ok: true })
}
