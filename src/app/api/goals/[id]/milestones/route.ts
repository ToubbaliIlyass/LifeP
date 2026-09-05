import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getNodeById } from '@/lib/graph/queries'

// A "milestone" is just a Task linked to a Goal via a part-of edge — the
// Goal's progress % (GET /api/goals) already counts linked Tasks, so a new
// milestone here shows up there automatically.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const goalId = parseInt(idStr, 10)
  if (isNaN(goalId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const goal = await getNodeById(user.id, goalId)
  if (!goal || goal.type !== 'Goal') return Response.json({ error: 'Goal not found' }, { status: 404 })

  const body = await request.json() as { name?: string; dueDate?: string | null }
  const name = body.name?.trim()
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })

  const task = await createNode(user.id, 'Task', {
    name,
    status: 'todo',
    dueDate: body.dueDate ?? null,
  })
  await createEdge(user.id, task.id, goalId, 'part-of')

  return Response.json({ ok: true, milestone: { id: task.id, name, status: 'todo', dueDate: body.dueDate ?? null } })
}
