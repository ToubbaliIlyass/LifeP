import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getEdges, deleteNode } from '@/lib/graph/queries'

export async function POST(request: Request) {
  const user = getCurrentUser()
  const body = await request.json() as {
    date: string
    startTime: string
    endTime: string
    sourceNodeId?: number
    // A one-off item (a Task, say) should only ever have a single scheduled
    // slot — set by the "Add to calendar" dialog, which passes this so
    // re-scheduling moves the existing block instead of stacking up a new
    // TimeBlock alongside it every time. Habits scheduling via calendar
    // drag-and-drop don't set this, since a recurring habit legitimately
    // gets a separate block per occurrence.
    replaceExisting?: boolean
  }

  if (body.replaceExisting && body.sourceNodeId) {
    const existing = getEdges(user.id, { type: 'scheduled-for' })
      .filter((e) => e.targetId === body.sourceNodeId)
    for (const edge of existing) {
      deleteNode(user.id, edge.sourceId) // the TimeBlock; cascades the edge
    }
  }

  const block = createNode(user.id, 'TimeBlock', {
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
  })

  if (body.sourceNodeId) {
    createEdge(user.id, block.id, body.sourceNodeId, 'scheduled-for', {})
  }

  return Response.json({ ok: true, block })
}
