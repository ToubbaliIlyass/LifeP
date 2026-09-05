import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodeById, getNodeWithNeighbors, updateNode, deleteNode, getEdges } from '@/lib/graph/queries'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const nodeId = parseInt(idStr, 10)
  if (isNaN(nodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const result = await getNodeWithNeighbors(user.id, nodeId)
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
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const nodeId = parseInt(idStr, 10)
  if (isNaN(nodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await getNodeById(user.id, nodeId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json() as Record<string, unknown> & { __remove?: string[] }

  // Properties are merged, so a partial update never has to resend the whole
  // object. That leaves no way to *delete* a key though — which matters now
  // that custom fields can be added freely — hence __remove.
  const { __remove, ...changes } = body
  const merged: Record<string, unknown> = {
    ...(existing.properties as Record<string, unknown>),
    ...changes,
  }
  if (Array.isArray(__remove)) {
    for (const key of __remove) delete merged[key]
  }

  const updated = await updateNode(user.id, nodeId, merged)

  return Response.json({ ok: true, node: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const nodeId = parseInt(idStr, 10)
  if (isNaN(nodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await getNodeById(user.id, nodeId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  // The deleted node and its edges come back in the response so the caller
  // can offer an undo. Deleting cascades the edges away, so if they are not
  // captured here they are gone for good and "undo" could only ever restore
  // an orphan.
  const attached = (await getEdges(user.id)).filter(
    (e) => e.sourceId === nodeId || e.targetId === nodeId,
  )

  await deleteNode(user.id, nodeId)

  return Response.json({
    ok: true,
    deleted: {
      type: existing.type,
      properties: existing.properties,
      edges: attached.map((e) => ({
        sourceId: e.sourceId,
        targetId: e.targetId,
        type: e.type,
        properties: e.properties,
      })),
    },
  })
}
