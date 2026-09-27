import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getEdges, deleteNode } from '@/lib/graph/queries'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
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
    /**
     * Makes this a routine: one block that occurs on many days, carrying the
     * same contents each time. Same vocabulary as Events and Habits.
     */
    frequency?: string
    daysOfWeek?: number[]
    until?: string
    /** What the session is called, when it holds more than one thing. */
    label?: string
  }

  if (body.replaceExisting && body.sourceNodeId) {
    const existing = (await getEdges(user.id, { type: 'scheduled-for' }))
      .filter((e) => e.targetId === body.sourceNodeId)
    for (const edge of existing) {
      await deleteNode(user.id, edge.sourceId) // the TimeBlock; cascades the edge
    }
  }

  const RECURRENCE = ['daily', 'weekdays', 'weekly']
  const block = await createNode(user.id, 'TimeBlock', {
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
    ...(typeof body.frequency === 'string' && RECURRENCE.includes(body.frequency)
      ? {
          frequency: body.frequency,
          ...(Array.isArray(body.daysOfWeek) ? { daysOfWeek: body.daysOfWeek } : {}),
          ...(typeof body.until === 'string' ? { until: body.until } : {}),
        }
      : {}),
    ...(typeof body.label === 'string' && body.label.trim() ? { label: body.label.trim().slice(0, 120) } : {}),
  })

  if (body.sourceNodeId) {
    await createEdge(user.id, block.id, body.sourceNodeId, 'scheduled-for', {})
  }

  return Response.json({ ok: true, block })
}
