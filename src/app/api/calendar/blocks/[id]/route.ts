import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodeById, updateNode, deleteNode } from '@/lib/graph/queries'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const blockId = parseInt(idStr, 10)
  if (isNaN(blockId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = getNodeById(user.id, blockId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json() as { startTime?: string; endTime?: string; date?: string }
  const updated = updateNode(user.id, blockId, {
    ...(existing.properties as Record<string, unknown>),
    ...body,
  })

  return Response.json({ ok: true, block: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const blockId = parseInt(idStr, 10)
  if (isNaN(blockId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = getNodeById(user.id, blockId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  deleteNode(user.id, blockId)
  return Response.json({ ok: true })
}
