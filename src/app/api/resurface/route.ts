import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodeById, getNodes, updateNode } from '@/lib/graph/queries'
import { readSettings } from '@/lib/settings'
import { hiddenTypes } from '@/lib/modules'
import { todayStr } from '@/lib/date'
import { findResurfaced } from '@/lib/resurface'

/** Enough to review in one sitting. The rest keeps until next time. */
const PAGE = 12

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const settings = await readSettings(user.id)
  const asked = Number(searchParams.get('days'))
  const days = Number.isFinite(asked) && asked > 0 ? Math.min(365, Math.round(asked)) : settings.resurfaceDays

  const [nodes, edges, habitLogs] = await Promise.all([
    getNodes(user.id),
    getEdges(user.id),
    getNodes(user.id, { type: 'HabitLog' }),
  ])

  // A module that is off has nothing to offer back: its nodes are not gone,
  // but as far as this user's app is concerned they do not exist.
  const off = hiddenTypes(settings)
  const all = findResurfaced({
    today: todayStr(),
    days,
    nodes: nodes.filter((n) => !off.has(n.type)),
    edges,
    habitLogs,
  })
  return Response.json({ days, total: all.length, items: all.slice(0, PAGE) })
}

/**
 * The two answers a review needs.
 *
 * `keep`    still relevant — stamps it as reviewed, which restarts its clock
 *           without pretending any work was done on it.
 * `dismiss` stop asking. Recorded on the node rather than in a separate
 *           ignore-list so it travels with an export and cannot go stale.
 *
 * Neither deletes anything: a review that can quietly destroy things is one
 * people learn to click through carefully, which defeats the point.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { nodeId?: unknown; action?: unknown }
  const nodeId = typeof body.nodeId === 'number' ? body.nodeId : Number(body.nodeId)
  if (!Number.isInteger(nodeId)) return Response.json({ error: 'nodeId is required' }, { status: 400 })
  if (body.action !== 'keep' && body.action !== 'dismiss') {
    return Response.json({ error: 'action must be "keep" or "dismiss"' }, { status: 400 })
  }

  const node = await getNodeById(user.id, nodeId)
  if (!node) return Response.json({ error: 'Not found' }, { status: 404 })

  const properties = {
    ...(node.properties as Record<string, unknown>),
    reviewedAt: new Date().toISOString(),
    ...(body.action === 'dismiss' ? { resurface: false } : {}),
  }
  await updateNode(user.id, nodeId, properties)

  return Response.json({ ok: true })
}
