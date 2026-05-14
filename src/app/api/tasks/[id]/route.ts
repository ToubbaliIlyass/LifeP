import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, updateNode } from '@/lib/graph/queries'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const taskId = parseInt(idStr, 10)
  if (isNaN(taskId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json() as { status: string }

  const task = getNodes(user.id, { type: 'Task' }).find((n) => n.id === taskId)
  if (!task) return Response.json({ error: 'Task not found' }, { status: 404 })

  const props = { ...(task.properties as Record<string, unknown>) }
  const prevStatus = typeof props.status === 'string' ? props.status : 'todo'
  const newStatus = body.status

  // Track transition timestamp for archive logic
  if (newStatus === 'done' && prevStatus !== 'done') {
    props.completedAt = new Date().toISOString()
  } else if (newStatus !== 'done') {
    delete props.completedAt
  }

  props.status = newStatus

  const updated = updateNode(user.id, taskId, props)
  return Response.json({ ok: true, task: updated })
}
