import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, findExistingEdge, getEdges, getNodeById, getNodes, setNodeType } from '@/lib/graph/queries'
import type { Node } from '@/lib/db/schema'

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

function toMilestone(node: Node) {
  const p = node.properties as Record<string, unknown>
  return {
    id: node.id,
    name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Milestone #${node.id}`,
    status: typeof p.status === 'string' ? p.status : 'todo',
    dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
  }
}

async function goalFrom(userId: number, params: Promise<{ id: string }>) {
  const goalId = parseInt((await params).id, 10)
  if (isNaN(goalId)) return null
  const goal = await getNodeById(userId, goalId)
  return goal?.type === 'Goal' ? goal : null
}

/**
 * Milestones that could be linked to this goal: every one not already on it.
 *
 * Listed in full rather than searched, because a person linking a milestone
 * wants to see what exists — there are rarely more than a few dozen.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const goal = await goalFrom(user.id, params)
  if (!goal) return Response.json({ error: 'Goal not found' }, { status: 404 })

  const [milestones, edges] = await Promise.all([
    getNodes(user.id, { type: 'Milestone' }),
    getEdges(user.id),
  ])
  const linked = new Set(
    edges
      .filter((e) => e.sourceId === goal.id || e.targetId === goal.id)
      .map((e) => (e.sourceId === goal.id ? e.targetId : e.sourceId)),
  )
  return Response.json({ milestones: milestones.filter((m) => !linked.has(m.id)).map(toMilestone) })
}

/**
 * Puts a milestone on this goal, in one of three ways:
 *
 *   { name, dueDate? }   a new one
 *   { milestoneId }      an existing Milestone, linked here too
 *   { fromTaskId }       a Task that was really a milestone, turned into one
 *
 * The last is how milestones made before they were their own type come back:
 * those are still Tasks, and there is no telling them apart from ordinary
 * tasks linked to a goal, so it is the person's call, one at a time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const goal = await goalFrom(user.id, params)
  if (!goal) return Response.json({ error: 'Goal not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    dueDate?: string | null
    milestoneId?: number
    fromTaskId?: number
  }

  if (typeof body.milestoneId === 'number' || typeof body.fromTaskId === 'number') {
    const id = (body.milestoneId ?? body.fromTaskId) as number
    const node = await getNodeById(user.id, id)
    const wanted = typeof body.milestoneId === 'number' ? 'Milestone' : 'Task'
    if (!node || node.type !== wanted) return Response.json({ error: `${wanted} not found` }, { status: 404 })

    const converted = wanted === 'Task' ? await setNodeType(user.id, node.id, 'Milestone') : node
    if (!(await findExistingEdge(user.id, node.id, goal.id, 'part-of'))) {
      await createEdge(user.id, node.id, goal.id, 'part-of')
    }
    return Response.json({ ok: true, milestone: toMilestone(converted ?? node) })
  }

  const name = body.name?.trim()
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })

  const milestone = await createNode(user.id, 'Milestone', {
    name,
    status: 'todo',
    dueDate: body.dueDate ?? null,
  })
  await createEdge(user.id, milestone.id, goal.id, 'part-of')

  return Response.json({ ok: true, milestone: toMilestone(milestone) })
}
