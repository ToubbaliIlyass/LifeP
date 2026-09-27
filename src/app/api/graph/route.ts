import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodeWithNeighbors, getNodes } from '@/lib/graph/queries'
import { hiddenTypes } from '@/lib/modules'
import { isSecretType, visibleToClient } from '@/lib/graph/secrets'
import { readSettings } from '@/lib/settings'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { searchParams } = new URL(request.url)
  // Types belonging to a switched-off module are not drawn, and neither are
  // the edges into them — a graph is the one view where a hidden thing would
  // otherwise still show up as a line going nowhere.
  const off = hiddenTypes(await readSettings(user.id))
  const filterParam = searchParams.get('filter') // e.g. "type:Habit"
  const focusId = searchParams.get('focus')
  // Neighborhood view: return a node and its neighbors up to depth
  if (focusId) {
    const nodeId = parseInt(focusId, 10)
    const result = await getNodeWithNeighbors(user.id, nodeId)
    if (!result) return Response.json({ nodes: [], edges: [] })
    if (off.has(result.node.type) || isSecretType(result.node.type)) return Response.json({ nodes: [], edges: [] })
    const visible = result.neighbors.filter((n) => !off.has(n.node.type) && !isSecretType(n.node.type))
    const nodes = [result.node, ...visible.map((n) => n.node)]
    const edges = visible.map((n) => n.edge)
    return Response.json({ nodes, edges })
  }

  // Parse type filter: "type:Habit" → { type: 'Habit' }
  let typeFilter: string | undefined
  if (filterParam?.startsWith('type:')) {
    typeFilter = filterParam.slice(5)
  }

  const nodes = visibleToClient(await getNodes(user.id, typeFilter ? { type: typeFilter } : undefined))
    .filter((n) => !off.has(n.type))
  const nodeIds = new Set(nodes.map((n) => n.id))
  const allEdges = await getEdges(user.id)
  // Only include edges where both endpoints are in the result set
  const edges = allEdges.filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))

  return Response.json({ nodes, edges })
}
