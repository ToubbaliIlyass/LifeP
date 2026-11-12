import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { displayName } from '@/lib/graph/naming'
import { containerOf } from '@/lib/todos'
import { archivedOf, finishedDay, monthOf } from '@/lib/archive'

const MONTH = /^\d{4}-\d{2}$/
const props = (n: { properties: unknown }) => n.properties as Record<string, unknown>

/**
 * The Logbook's archive (src/lib/archive.ts), on demand.
 *
 *   GET /api/archive             the months that have anything, newest first, with counts
 *   GET /api/archive?month=2026-09   what was finished that month
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [nodes, edges] = await Promise.all([getNodes(user.id), getEdges(user.id)])
  const archived = archivedOf(nodes)
  const month = new URL(request.url).searchParams.get('month')

  if (!month) {
    const counts = new Map<string, number>()
    for (const n of archived) counts.set(monthOf(n), (counts.get(monthOf(n)) ?? 0) + 1)
    const months = [...counts].map(([m, count]) => ({ month: m, count })).sort((a, b) => b.month.localeCompare(a.month))
    return Response.json({ total: archived.length, months }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!MONTH.test(month)) return Response.json({ error: 'month must look like 2026-09' }, { status: 400 })

  const kindById = new Map<number, 'area' | 'project'>()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const n of nodes) {
    if (n.type === 'Goal') kindById.set(n.id, 'area')
    else if (n.type === 'Project') kindById.set(n.id, 'project')
  }
  const items = archived
    .filter((n) => monthOf(n) === month)
    .map((n) => {
      const home = n.type === 'Task' ? containerOf(n.id, edges, kindById) : null
      const homeNode = home === null ? null : byId.get(home)
      return {
        id: n.id,
        kind: n.type === 'Project' ? ('project' as const) : ('todo' as const),
        title: displayName(n.type, props(n)),
        doneAt: String(props(n).completedAt ?? n.updatedAt),
        day: finishedDay(n),
        place: homeNode ? displayName(homeNode.type, props(homeNode)) : null,
      }
    })
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt))
  return Response.json({ month, items }, { headers: { 'Cache-Control': 'no-store' } })
}
