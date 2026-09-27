import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { todayStr } from '@/lib/date'
import { blockStartFor, nowMinutes, recordSignal } from '@/lib/availability'
import { setTaskStatus } from '@/lib/tasks'

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

  // Status, completion timestamp and the recurring hand-off all live in one
  // place now — the assistant's day log completes tasks too, and the two must
  // not disagree about what "done" does. See src/lib/tasks.ts.
  const change = await setTaskStatus(user.id, taskId, body.status)
  if (!change) return Response.json({ error: 'Task not found' }, { status: 404 })

  // Quietly learn when things actually get done: the slot it was planned in
  // if there was one (ticking it off later is common), otherwise right now.
  if (body.status === 'done' && change.previous !== 'done') {
    const today = todayStr()
    const p = change.task.properties as Record<string, unknown>
    await recordSignal(user.id, {
      kind: 'done',
      itemType: 'Task',
      itemId: taskId,
      name: typeof p.name === 'string' ? p.name : `Task #${taskId}`,
      date: today,
      minute: (await blockStartFor(user.id, taskId, today)) ?? nowMinutes(),
    })
  }

  // Returned so an undo can remove it again. Without this, undoing a
  // completion would restore the status but silently leave the next
  // occurrence behind — an undo that only half works is worse than none.
  return Response.json({ ok: true, task: change.task, spawned: change.spawned })
}
