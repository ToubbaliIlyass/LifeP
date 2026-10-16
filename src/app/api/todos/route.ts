import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createEdge, createNode, getEdges, getNodeById, getNodes } from '@/lib/graph/queries'
import { clockIn, zoneFor } from '@/lib/clock'
import { readSettings } from '@/lib/settings'
import { prayerTimesFor, findPrayerHabit } from '@/lib/prayers'
import { DEFAULT_TASK_MINUTES } from '@/lib/schedule'
import { buildTodos } from '@/lib/todos'
import { todayStr } from '@/lib/date'
import { setTaskTime } from '@/lib/task-time'
import type { PrayerSlot } from '@/lib/now'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const day = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : null)

/** "daily" | "weekdays" | "weekly" as the recurrence a node stores; weekly repeats on `day`'s weekday. */
function recurrenceFor(repeats: unknown, day: string, days?: unknown): { frequency: string; daysOfWeek?: number[] } | null {
  // "every tue and thu": the days said, rather than the one the to-do starts on.
  const said = Array.isArray(days) ? days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : []
  if (repeats === 'weekly' && said.length) return { frequency: 'weekly', daysOfWeek: said }
  if (repeats === 'daily') return { frequency: 'daily' }
  if (repeats === 'weekdays') return { frequency: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5] }
  if (repeats === 'weekly') return { frequency: 'weekly', daysOfWeek: [new Date(day + 'T00:00:00').getDay()] }
  return null
}

/**
 * Every list the app shows, from one read of the graph.
 *
 * The screen sorts these into Inbox, Today, Upcoming and the rest for itself
 * (src/lib/todo-views.ts): moving a to-do between lists is then instant, and
 * the sidebar's counts cannot disagree with the list beside them.
 *
 * `tz` is the browser's zone — "today" is the user's, not the server's, and
 * prayer times are local solar times (see src/lib/clock.ts).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const settings = await readSettings(user.id)
  const zone = zoneFor(new URL(request.url).searchParams.get('tz'), settings.timeZone, settings.timeZoneOverride)
  const date = clockIn(zone).date

  const [nodes, edges] = await Promise.all([getNodes(user.id), getEdges(user.id)])

  const times = prayerTimesFor(settings, date, zone)
  let prayers: PrayerSlot[] | undefined
  let prayerHabitId: number | null = null
  if (times.length > 0) {
    prayerHabitId = findPrayerHabit(nodes.filter((n) => n.type === 'Habit'), settings.prayer.habitNodeId)
    const log = nodes.find((n) => {
      const p = n.properties as Record<string, unknown>
      return n.type === 'HabitLog' && p.habitNodeId === prayerHabitId && p.date === date
    })
    const raw = (log?.properties as Record<string, unknown> | undefined)?.prayers
    const done = new Set(Array.isArray(raw) ? (raw as string[]) : [])
    prayers = times.map((p) => ({ ...p, done: done.has(p.key) }))
  }

  return Response.json(buildTodos({ date, nodes, edges, prayers, prayerHabitId }))
}

/**
 * A new to-do, project or area, made by hand.
 *
 * Never queued for approval: that check is for what the assistant infers, and
 * here the user typed it themselves.
 *
 * Body: { kind?: 'todo' | 'project' | 'area', title, when?, evening?,
 *         someday?, deadline?, repeats?, tags?, order?, listId?, headingId?,
 *         areaId? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const kind = typeof body.kind === 'string' ? body.kind : 'todo'
  const order = typeof body.order === 'number' ? { order: body.order } : {}

  if (kind === 'area') {
    const node = await createNode(user.id, 'Goal', { name: title, status: 'active', ...order })
    return Response.json({ ok: true, id: node.id })
  }

  if (kind === 'project') {
    const node = await createNode(user.id, 'Project', { name: title, status: 'active', ...order })
    const area = typeof body.areaId === 'number' ? await getNodeById(user.id, body.areaId) : undefined
    if (area?.type === 'Goal') await createEdge(user.id, node.id, area.id, 'part-of')
    return Response.json({ ok: true, id: node.id })
  }

  if (!title) return Response.json({ error: 'A to-do needs a title' }, { status: 400 })

  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : []
  const recurrence = recurrenceFor(body.repeats, day(body.when) ?? todayStr(), body.repeatDays)
  const node = await createNode(user.id, 'Task', {
        name: title,
        status: 'todo',
        priority: body.priority === 'high' || body.priority === 'low' ? body.priority : 'medium',
        estimatedMinutes: typeof body.minutes === 'number' && body.minutes > 0 ? Math.round(body.minutes) : DEFAULT_TASK_MINUTES,
        ...(typeof body.notes === 'string' && body.notes.trim() ? { notes: body.notes } : {}),
        ...(body.someday === true ? { someday: true } : day(body.when) ? { dueDate: day(body.when) } : {}),
        ...(body.evening === true ? { evening: true } : {}),
        ...(day(body.deadline) ? { deadline: day(body.deadline) } : {}),
        ...(tags.length ? { tags } : {}),
        ...(recurrence ? { recurrence } : {}),
        ...(typeof body.reminder === 'string' && /^\d{2}:\d{2}$/.test(body.reminder) ? { reminder: body.reminder } : {}),
        ...(typeof body.headingId === 'string' && body.headingId ? { headingId: body.headingId } : {}),
        ...(Array.isArray(body.checklist) && body.checklist.length ? { checklist: body.checklist } : {}),
        ...order,
      })

  // A time given while typing it in: placed on its day (today, if it had none).
  if (kind !== 'routine' && typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) && body.someday !== true) {
    await setTaskTime(user.id, node.id, day(body.when) ?? todayStr(), { time: body.time, minutes: typeof body.minutes === 'number' ? body.minutes : null })
  }

  const list = typeof body.listId === 'number' ? await getNodeById(user.id, body.listId) : undefined
  if (list && (list.type === 'Project' || list.type === 'Goal')) {
    await createEdge(user.id, node.id, list.id, 'part-of')
  }

  return Response.json({ ok: true, id: node.id })
}
