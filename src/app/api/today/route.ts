import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'
import { activeProjects, buildPulse, pickGoalNudge } from '@/lib/today'

/**
 * Everything the dashboard shows that is not the Now timeline.
 *
 * One endpoint and one read of the graph, rather than the four parallel
 * fetches Today used to make for four lists it no longer shows.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [nodes, edges] = await Promise.all([getNodes(user.id), getEdges(user.id)])
  const habitLogs = nodes.filter((n) => n.type === 'HabitLog')
  const today = todayStr()

  return Response.json({
    projects: activeProjects({ today, nodes, edges, habitLogs }),
    nudge: pickGoalNudge({ today, nodes, edges, habitLogs }),
    pulse: buildPulse({ today, nodes, habitLogs }),
  })
}
