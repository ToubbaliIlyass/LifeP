import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'
import { toMinutes } from '@/lib/schedule'
import { buildNowQueue } from '@/lib/now'

/**
 * Everything today, as one ordered list.
 *
 * Today's dashboard showed habits, tasks, events and goals as four parallel
 * lists, leaving the reader to merge them and decide — the exact work this
 * app exists to remove.
 *
 * Deliberately does *not* decide which item is "now": the server is in UTC
 * once deployed and has no idea what time it is where the user is, so the
 * client compares against its own clock.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const date = todayStr()

  const [tasks, habits, habitLogs, events, timeBlocks, scheduledEdges] = await Promise.all([
    getNodes(user.id, { type: 'Task' }),
    getNodes(user.id, { type: 'Habit' }),
    getNodes(user.id, { type: 'HabitLog' }),
    getNodes(user.id, { type: 'Event' }),
    getNodes(user.id, { type: 'TimeBlock' }),
    getEdges(user.id, { type: 'scheduled-for' }),
  ])

  const items = buildNowQueue({ date, tasks, habits, habitLogs, events, timeBlocks, scheduledEdges })

  const settingsNodes = await getNodes(user.id, { type: 'Settings' })
  const settings = (settingsNodes[0]?.properties ?? {}) as { workingHours?: { start: string; end: string } }
  const hours = settings.workingHours ?? { start: '09:00', end: '18:00' }

  return Response.json({
    date,
    items,
    capacity: {
      committedMinutes: items.reduce((sum, i) => sum + (i.minutes ?? 0), 0),
      dayStart: hours.start,
      dayEnd: hours.end,
      workingMinutes: toMinutes(hours.end) - toMinutes(hours.start),
    },
  })
}
