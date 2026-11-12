import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { containerOf } from '@/lib/todos'
import { archivedOf, monthOf } from '@/lib/archive'
import { markRestored } from '@/lib/archive-server'

/**
 * Puts things back from the Archive: `{ ids: number[] }` or `{ month: '2026-09' }`.
 * Restoring a project brings its archived to-dos with it. What is put back is
 * marked so the daily sweep does not take it away again.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown; month?: unknown }
  const [nodes, edges] = await Promise.all([getNodes(user.id), getEdges(user.id)])
  const archived = archivedOf(nodes)
  const inArchive = new Map(archived.map((n) => [n.id, n]))

  const wanted = new Set<number>()
  if (typeof body.month === 'string') for (const n of archived) if (monthOf(n) === body.month) wanted.add(n.id)
  if (Array.isArray(body.ids)) for (const id of body.ids) if (typeof id === 'number' && inArchive.has(id)) wanted.add(id)
  if (wanted.size === 0) return Response.json({ error: 'Nothing in the archive matches that.' }, { status: 400 })

  const kindById = new Map<number, 'area' | 'project'>()
  for (const n of nodes) {
    if (n.type === 'Goal') kindById.set(n.id, 'area')
    else if (n.type === 'Project') kindById.set(n.id, 'project')
  }
  // A project comes back with the to-dos that were filed in it.
  for (const n of archived) {
    if (n.type !== 'Task') continue
    const home = containerOf(n.id, edges, kindById)
    if (home !== null && wanted.has(home) && inArchive.get(home)?.type === 'Project') wanted.add(n.id)
  }

  await markRestored(user.id, [...wanted])
  return Response.json({ restored: wanted.size })
}
