import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodeWithNeighbors, getNodes } from '@/lib/graph/queries'

export async function GET(request: Request) {
  const user = getCurrentUser()
  const { searchParams } = new URL(request.url)
  const filterParam = searchParams.get('filter') // e.g. "type:Habit"
  const focusId = searchParams.get('focus')
  const depth = parseInt(searchParams.get('depth') ?? '1', 10)

  // Neighborhood view: return a node and its neighbors up to depth
  if (focusId) {
    const nodeId = parseInt(focusId, 10)
    const result = getNodeWithNeighbors(user.id, nodeId)
    if (!result) return Response.json({ nodes: [], edges: [] })
    const nodes = [result.node, ...result.neighbors.map((n) => n.node)]
    const edges = result.neighbors.map((n) => n.edge)
    return Response.json({ nodes, edges })
  }

  // Parse type filter: "type:Habit" → { type: 'Habit' }
  let typeFilter: string | undefined
  if (filterParam?.startsWith('type:')) {
    typeFilter = filterParam.slice(5)
  }

  const nodes = getNodes(user.id, typeFilter ? { type: typeFilter } : undefined)
  const nodeIds = new Set(nodes.map((n) => n.id))
  const allEdges = getEdges(user.id)
  // Only include edges where both endpoints are in the result set
  const edges = allEdges.filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))

  return Response.json({ nodes, edges })
}
