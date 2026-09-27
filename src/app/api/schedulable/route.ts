import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { readSettings } from '@/lib/settings'
import { workTypes } from '@/lib/modules'
import { displayName } from '@/lib/graph/naming'
import { DEFAULT_TASK_MINUTES } from '@/lib/schedule'
import { addDays, todayStr } from '@/lib/date'

/**
 * Work that belongs to a module and has no time yet.
 *
 * Tasks and habits could always be dragged out of the rail onto the calendar;
 * everything else could not. So the one thing a student most needs to give an
 * hour to — the assignment due Thursday — was the one thing the calendar
 * refused to take, and the only way to schedule it was to write a separate
 * task about it.
 *
 * The rail asks here for everything else it should offer. Which types those
 * are comes from the module registry, so a module added later can be dropped
 * onto the calendar without this route changing.
 */

/** Far enough ahead to plan for, near enough to still be this week's problem. */
const HORIZON_DAYS = 14

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const settings = await readSettings(user.id)
  const types = workTypes(settings)
  if (types.size === 0) return Response.json({ items: [] })

  const [nodes, edges] = await Promise.all([
    getNodes(user.id),
    getEdges(user.id, { type: 'scheduled-for' }),
  ])
  const scheduled = new Set(edges.map((e) => e.targetId))

  const today = todayStr()
  const horizon = addDays(today, HORIZON_DAYS)

  const items = nodes
    .filter((n) => types.has(n.type) && !scheduled.has(n.id))
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      const status = typeof p.status === 'string' ? p.status : null
      const stage = typeof p.stage === 'string' ? p.stage : null
      // Each type names its own date. A Course or Series has none: it is a
      // container, not a thing to sit down and do, so it never appears here.
      const when =
        typeof p.dueDate === 'string' ? p.dueDate
          : typeof p.date === 'string' ? p.date
          : typeof p.publishDate === 'string' ? p.publishDate
          : null
      return { node: n, p, status, stage, when }
    })
    .filter(({ status, stage, when }) => {
      if (status === 'submitted' || status === 'graded' || status === 'taken' || status === 'done') return false
      if (stage === 'published') return false
      // Undated work still needs doing, so it stays; dated work drops off the
      // rail once it is far enough out to be someone else's week.
      return !when || when <= horizon
    })
    .map(({ node, p, when }) => ({
      id: node.id,
      type: node.type,
      name: displayName(node.type, p),
      date: when,
      minutes:
        typeof p.duration === 'number' && p.duration > 0 ? p.duration
          : typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0 ? p.estimatedMinutes
          : DEFAULT_TASK_MINUTES,
    }))
    .sort((a, b) => (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31'))

  return Response.json({ items })
}
