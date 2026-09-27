import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { todayStr, addDays } from '@/lib/date'
import { collectWork, goalProgress } from '@/lib/goals'
import { hiddenTypes } from '@/lib/modules'
import { readSettings } from '@/lib/settings'

// Progress is always derived from the state of a goal's work, never stored —
// so it can never drift out of sync with what's actually been done. What
// counts as that work lives in src/lib/goals.ts, shared with the review.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // Every goal is returned with its status rather than filtering to active
  // here: the Goals panel needs paused and completed ones too, and Today
  // filters for itself.
  const [nodes, edges, habitLogs] = await Promise.all([
    getNodes(user.id),
    getEdges(user.id),
    getNodes(user.id, { type: 'HabitLog' }),
  ])

  // One read of the graph for every goal. This used to be a neighbour query
  // per goal, each of which read the whole node table anyway.
  const goals = nodes.filter((n) => n.type === 'Goal')
  // Work belonging to a switched-off module does not count towards a goal:
  // progress that moves because of assignments in a section the user does
  // not have is progress they cannot account for.
  const off = hiddenTypes(await readSettings(user.id))
  const work = collectWork(goals, nodes.filter((n) => !off.has(n.type)), edges)
  const since = addDays(todayStr(), -7)

  const result = goals.map((g) => {
    const p = g.properties as Record<string, unknown>
    const linked = work.get(g.id)!
    const { counted, progress } = goalProgress(linked, habitLogs, since)

    // Milestones are their own node type — a step towards the goal, not a
    // task to be scheduled. They are listed separately from the progress
    // count, which everything linked feeds into.
    const milestones = linked.direct
      .filter((n) => n.type === 'Milestone')
      .map((node) => {
        const tp = node.properties as Record<string, unknown>
        return {
          id: node.id,
          name: typeof tp.name === 'string' ? tp.name : typeof tp.title === 'string' ? tp.title : `Milestone #${node.id}`,
          status: typeof tp.status === 'string' ? tp.status : 'todo',
          dueDate: typeof tp.dueDate === 'string' ? tp.dueDate : null,
        }
      })

    return {
      id: g.id,
      name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Goal #${g.id}`,
      targetDate: typeof p.targetDate === 'string' ? p.targetDate : null,
      status: typeof p.status === 'string' ? p.status : 'active',
      description: typeof p.description === 'string' ? p.description : null,
      linkedCount: counted,
      progress,
      milestones,
    }
  })

  return Response.json({ goals: result })
}
