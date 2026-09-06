import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'

/**
 * The things a new task can belong to.
 *
 * Capture is only half the job — a task nobody can trace back to why it
 * matters is just a line on a list. Offering the goals and projects at the
 * moment of capture is the one point where the link costs nothing to make;
 * asking someone to go back and connect things later means it never happens.
 *
 * Completed and paused goals are left out: they are not what a new task
 * belongs to, and including them would bury the handful that are live.
 */
const LINKABLE = ['Goal', 'Project', 'Course'] as const

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const groups = await Promise.all(
    LINKABLE.map(async (type) => {
      const nodes = await getNodes(user.id, { type })
      return nodes
        .filter((n) => {
          const status = (n.properties as Record<string, unknown>).status
          return type !== 'Goal' || status === undefined || status === 'active'
        })
        .map((n) => {
          const p = n.properties as Record<string, unknown>
          return {
            id: n.id,
            type,
            name:
              typeof p.name === 'string' ? p.name
                : typeof p.title === 'string' ? p.title
                : `${type} #${n.id}`,
          }
        })
    }),
  )

  return Response.json({ targets: groups.flat() })
}
