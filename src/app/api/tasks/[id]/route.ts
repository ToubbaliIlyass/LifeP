import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, updateNode, createNode } from '@/lib/graph/queries'
import { todayStr, nextDueDate } from '@/lib/date'

interface Recurrence { frequency: 'daily' | 'weekly' | 'weekdays'; daysOfWeek?: number[] }

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const taskId = parseInt(idStr, 10)
  if (isNaN(taskId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json() as { status: string }

  const task = (await getNodes(user.id, { type: 'Task' })).find((n) => n.id === taskId)
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

  const updated = await updateNode(user.id, taskId, props)

  // A recurring Task completing shouldn't just vanish — it should hand off
  // to its next occurrence, the same way a recurring Habit is never a
  // one-shot. Only fires on the todo/in-progress -> done transition, never
  // on undo (status !== 'done'), so toggling done/undone repeatedly can't
  // spawn duplicates.
  const recurrence = props.recurrence as Recurrence | undefined
  let spawned: { id: number } | null = null
  if (newStatus === 'done' && prevStatus !== 'done' && recurrence?.frequency) {
    const baseDate = typeof props.dueDate === 'string' ? props.dueDate : todayStr()
    const next = nextDueDate(baseDate, recurrence.frequency, recurrence.daysOfWeek ?? null)
    const created = await createNode(user.id, 'Task', {
      ...props,
      status: 'todo',
      dueDate: next,
      completedAt: undefined,
    })
    // Returned so an undo can remove it again. Without this, undoing a
    // completion would restore the status but silently leave the next
    // occurrence behind — an undo that only half works is worse than none.
    spawned = { id: created.id }
  }

  return Response.json({ ok: true, task: updated, spawned })
}
