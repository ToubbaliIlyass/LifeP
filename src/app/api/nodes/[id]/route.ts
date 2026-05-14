import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodeById, getNodeWithNeighbors, updateNode, deleteNode } from '@/lib/graph/queries'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const nodeId = parseInt(idStr, 10)
  if (isNaN(nodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const result = getNodeWithNeighbors(user.id, nodeId)
  if (!result) return Response.json({ error: 'Not found' }, { status: 404 })

  // Collect related notes and logs from neighbors
  const relatedNotes = result.neighbors
    .map(({ node, edge, direction }) => ({
      id: node.id,
      type: node.type,
      properties: node.properties,
      edgeType: edge.type,
      direction,
    }))
    .filter(({ type }) => ['Note', 'JournalEntry', 'HabitLog'].includes(type))

  const relatedNodes = result.neighbors
    .map(({ node, edge, direction }) => ({
      id: node.id,
      type: node.type,
      properties: node.properties,
      edgeType: edge.type,
      direction,
    }))
    .filter(({ type }) => !['Note', 'JournalEntry', 'HabitLog'].includes(type))

  return Response.json({
    node: result.node,
    relatedNotes,
    relatedNodes,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const nodeId = parseInt(idStr, 10)
  if (isNaN(nodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = getNodeById(user.id, nodeId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json() as Record<string, unknown>

  const updated = updateNode(user.id, nodeId, {
    ...(existing.properties as Record<string, unknown>),
    ...body,
  })

  return Response.json({ ok: true, node: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const nodeId = parseInt(idStr, 10)
  if (isNaN(nodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = getNodeById(user.id, nodeId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  deleteNode(user.id, nodeId)
  return Response.json({ ok: true })
}
