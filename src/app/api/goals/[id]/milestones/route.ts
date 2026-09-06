import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getNodeById } from '@/lib/graph/queries'

/**
 * Milestones are their own node type, not Tasks.
 *
 * They were Tasks originally, to reuse the status machinery. The cost was
 * that every milestone also became a real task: it showed up in the task
 * list, in the Now queue, and in auto-scheduling, competing for time with
 * things that actually needed doing today. A milestone is a marker of
 * progress on a goal ("ship the beta"), not an action you sit down and do,
 * so it should not be scheduled or surfaced as work.
 *
 * It keeps the same `status` vocabulary, so the checklist behaves the same.
 */
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

  const milestone = await createNode(user.id, 'Milestone', {
    name,
    status: 'todo',
    dueDate: body.dueDate ?? null,
  })
  await createEdge(user.id, milestone.id, goalId, 'part-of')

  return Response.json({
    ok: true,
    milestone: { id: milestone.id, name, status: 'todo', dueDate: body.dueDate ?? null },
  })
}
