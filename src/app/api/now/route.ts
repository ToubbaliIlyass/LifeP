import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges } from '@/lib/graph/queries'
import { addDays } from '@/lib/date'
import { clockIn } from '@/lib/clock'
import { dayView } from '@/lib/day-view'
import { fromMinutes } from '@/lib/schedule'
import { toMinutes, occupiedMinutes, DEFAULT_DAY } from '@/lib/schedule'
import { buildNowQueue, buildTodayHabits, buildUpcomingTasks, type PrayerSlot } from '@/lib/now'
import { workTypes } from '@/lib/modules'
import { readSettings } from '@/lib/settings'
import { prayerTimesFor, findPrayerHabit } from '@/lib/prayers'
import { zoneFor } from '@/lib/clock'

/**
 * Everything today, as one ordered list.
 *
 * Today's dashboard showed habits, tasks, events and goals as four parallel
 * lists, leaving the reader to merge them and decide — the exact work this
 * app exists to remove.
 *
 * Deliberately does *not* decide which item is "now": the server is in UTC
 * once deployed and has no idea what time it is where the user is, so the
 * client compares against its own clock. For the same reason the client
 * passes its own zone in `tz`, which prayer times need — they are local
 * solar times, and an hour out is not a rounding error.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const settings = await readSettings(user.id)
  // The user's today, not the server's — see src/lib/clock.ts.
  const zone = zoneFor(new URL(request.url).searchParams.get('tz'), settings.timeZone)
  const clock = clockIn(zone)
  const date = clock.date

  const [tasks, habits, habitLogs, events, timeBlocks, scheduledEdges, allNodes] = await Promise.all([
    getNodes(user.id, { type: 'Task' }),
    getNodes(user.id, { type: 'Habit' }),
    getNodes(user.id, { type: 'HabitLog' }),
    getNodes(user.id, { type: 'Event' }),
    getNodes(user.id, { type: 'TimeBlock' }),
    getEdges(user.id, { type: 'scheduled-for' }),
    getNodes(user.id),
  ])

  /*
   * The dated things the enabled modules own. Which types those are is the
   * registry's business, not this route's — so a module added later appears
   * on Today without anyone remembering to come back here.
   */
  const datedTypes = workTypes(settings)
  const dueItems = allNodes.filter((n) => datedTypes.has(n.type))

  // ── The five, if they are switched on and we know where the user is ──
  const times = prayerTimesFor(settings, date, zone)
  let prayers: PrayerSlot[] | undefined
  let prayerHabitId: number | null = null
  if (times.length > 0) {
    prayerHabitId = findPrayerHabit(habits, settings.prayer.habitNodeId)
    const todayLog = habitLogs.find((l) => {
      const p = l.properties as Record<string, unknown>
      return p.habitNodeId === prayerHabitId && p.date === date
    })
    const doneRaw = (todayLog?.properties as Record<string, unknown> | undefined)?.prayers
    const done = new Set(Array.isArray(doneRaw) ? (doneRaw as string[]) : [])
    prayers = times.map((p) => ({ ...p, done: done.has(p.key) }))
  }

  const items = buildNowQueue({
    date, tasks, habits, habitLogs, events, timeBlocks, scheduledEdges, dueItems, prayers, prayerHabitId,
  })

  // The column beside the timeline: habits with no time of their own, and
  // the week's tasks ahead of their due dates.
  const todayHabits = buildTodayHabits({
    date, habits, habitLogs, timeBlocks, scheduledEdges,
    hiddenHabitId: prayers?.length ? prayerHabitId : null,
  })
  const upcoming = buildUpcomingTasks({ date, until: addDays(date, 7), tasks })

  const hours = settings.workingHours ?? DEFAULT_DAY

  /*
   * Wall-clock, not a sum.
   *
   * Timed items are merged so overlap is counted once — a task worked on
   * during a Deep Work block is the same hour of the day, not two. Adding
   * them up reported an ordinary day as two hours overbooked when it was
   * six hours clear. Untimed items are added on top: they still have to
   * happen, and nothing on the clock is holding time for them.
   */
  // A finished session is still shown, but it no longer holds any of the day.
  const open = items.filter((i) => !i.completed)
  const timed = open
    .filter((i) => i.startTime && i.endTime)
    .map((i) => ({ start: toMinutes(i.startTime!), end: toMinutes(i.endTime!) }))
  const scheduledMinutes = occupiedMinutes(timed)
  const unscheduledMinutes = open
    .filter((i) => !i.startTime)
    .reduce((sum, i) => sum + (i.minutes ?? 0), 0)

  /*
   * What is already done today, so the page shows the day's progress and
   * not only what is left — by evening, "what is left" is one prayer and the
   * page read as though nothing had happened at all.
   */
  const done = tasks
    .flatMap((t) => {
      const p = t.properties as Record<string, unknown>
      if (p.status !== 'done' || typeof p.completedAt !== 'string') return []
      const at = new Date(p.completedAt)
      if (Number.isNaN(at.getTime())) return []
      const local = clockIn(zone, at)
      if (local.date !== date) return []
      const name = typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${t.id}`
      return [{ id: t.id, name, at: fromMinutes(local.minutes) }]
    })
    .sort((a, b) => a.at.localeCompare(b.at))

  // Tomorrow's shape, for the evening: what is already on its clock.
  const tomorrowDate = addDays(date, 1)
  const tomorrow = { date: tomorrowDate, onTheClock: (await dayView(user.id, tomorrowDate)).onTheClock }

  return Response.json({
    done,
    tomorrow,
    date,
    items,
    habits: todayHabits,
    upcoming,
    capacity: {
      committedMinutes: scheduledMinutes + unscheduledMinutes,
      scheduledMinutes,
      unscheduledMinutes,
      dayStart: hours.start,
      dayEnd: hours.end,
      workingMinutes: toMinutes(hours.end) - toMinutes(hours.start),
    },
  })
}
