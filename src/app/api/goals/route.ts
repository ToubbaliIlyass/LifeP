import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getNodeWithNeighbors } from '@/lib/graph/queries'
import { todayStr, addDays } from '@/lib/date'

// Progress is always derived from linked Habits/Tasks, never stored — so it
// can never drift out of sync with what's actually been done.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  // Every goal is returned with its status rather than filtering to active
  // here: the Goals panel needs paused and completed ones too, and Today
  // filters for itself.
  const goals = await getNodes(user.id, { type: 'Goal' })
  const habitLogs = await getNodes(user.id, { type: 'HabitLog' })
  const since = addDays(todayStr(), -7)

  // Each goal needs its own neighbour lookup, so these run concurrently
  // rather than serially awaiting one round trip per goal.
  const result = await Promise.all(goals.map(async (g) => {
    const p = g.properties as Record<string, unknown>
    const detail = await getNodeWithNeighbors(user.id, g.id)
    const linked = (detail?.neighbors ?? []).filter(
      (n) => n.node.type === 'Milestone' || n.node.type === 'Task' || n.node.type === 'Habit',
    )
    // Milestones are their own node type — a step towards the goal, not a
    // task to be scheduled. Linked Tasks and Habits still count towards
    // progress below; they just aren't listed as milestones.
    const milestones = linked
      .filter((n) => n.node.type === 'Milestone')
      .map(({ node }) => {
        const tp = node.properties as Record<string, unknown>
        return {
          id: node.id,
          name: typeof tp.name === 'string' ? tp.name : typeof tp.title === 'string' ? tp.title : `Task #${node.id}`,
          status: typeof tp.status === 'string' ? tp.status : 'todo',
          dueDate: typeof tp.dueDate === 'string' ? tp.dueDate : null,
        }
      })

    let done = 0
    for (const { node } of linked) {
      if (node.type === 'Milestone' || node.type === 'Task') {
        const tp = node.properties as Record<string, unknown>
        if (tp.status === 'done') done++
      } else {
        // A Habit counts as "on track" if it's been logged completed at
        // least once in the last week — a single stored `progress` number
        // would go stale the moment a habit was logged; this can't.
        const recentlyDone = habitLogs.some((l) => {
          const lp = l.properties as Record<string, unknown>
          return lp.habitNodeId === node.id && typeof lp.date === 'string' && lp.date >= since && lp.completed === true
        })
        if (recentlyDone) done++
      }
    }

    return {
      id: g.id,
      name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Goal #${g.id}`,
      targetDate: typeof p.targetDate === 'string' ? p.targetDate : null,
      status: typeof p.status === 'string' ? p.status : 'active',
      description: typeof p.description === 'string' ? p.description : null,
      linkedCount: linked.length,
      progress: linked.length > 0 ? Math.round((done / linked.length) * 100) : null,
      milestones,
    }
  }))

  return Response.json({ goals: result })
}
