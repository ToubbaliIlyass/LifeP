import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodeById, deleteNode, getEdges } from '@/lib/graph/queries'

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
