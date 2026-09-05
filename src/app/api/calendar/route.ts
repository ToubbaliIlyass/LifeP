import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges, getNodeById, createNode, createEdge } from '@/lib/graph/queries'
import type { Node } from '@/lib/db/schema'
import { todayStr, isDueOn } from '@/lib/date'

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Habits shouldn't need to be dragged onto the calendar by hand every
 * single day — whenever a day's schedule is requested, any habit due that
 * day (per its own frequency/daysOfWeek — a weekly habit only ever gets
 * filled on the days it's actually set for) that isn't already on the
 * calendar and isn't already marked done gets a default slot
 * automatically, reusing whatever time it was last scheduled at (or a
 * generic morning default the first time a time hasn't been set yet).
 * Scoped to today-or-later only (the caller enforces this) — a past day
 * is never rewritten with a fabricated entry it didn't actually get.
 */
async function autoFillHabitsForDate(userId: number, date: string) {
  const dow = new Date(date + 'T00:00:00').getDay()
  const habits = await getNodes(userId, { type: 'Habit' })
  if (habits.length === 0) return

  const habitLogs = await getNodes(userId, { type: 'HabitLog' })
  const scheduledForEdges = await getEdges(userId, { type: 'scheduled-for' })
  const timeBlocks = await getNodes(userId, { type: 'TimeBlock' })
  const blockById = new Map(timeBlocks.map((b) => [b.id, b]))

  for (const habit of habits) {
    const p = habit.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    if (!isDueOn(frequency, daysOfWeek, dow)) continue

    // Any log for today — completed or not — means the user has already
    // made a decision about this occurrence (marked it done, or removed
    // its auto-filled slot from the calendar) and it shouldn't be
    // re-added out from under them.
    const hasLogToday = habitLogs.some((n) => {
      const lp = n.properties as Record<string, unknown>
      return lp.habitNodeId === habit.id && lp.date === date
    })
    if (hasLogToday) continue

    const blocksForHabit = scheduledForEdges
      .filter((e) => e.targetId === habit.id)
      .map((e) => blockById.get(e.sourceId))
      .filter((b): b is Node => b !== undefined)

    const alreadyScheduledToday = blocksForHabit.some(
      (b) => (b.properties as Record<string, unknown>).date === date,
    )
    if (alreadyScheduledToday) continue

    // Reuse the most recent prior slot's time-of-day, else a generic default.
    const mostRecent = blocksForHabit
      .map((b) => b.properties as Record<string, unknown>)
      .filter((bp) => typeof bp.date === 'string' && (bp.date as string) < date)
      .sort((a, b) => (b.date as string).localeCompare(a.date as string))[0]

    const durationMinutes = typeof p.durationMinutes === 'number' ? p.durationMinutes : 30
    const startTime = typeof mostRecent?.startTime === 'string' ? mostRecent.startTime : '08:00'
    const endTime = typeof mostRecent?.endTime === 'string' ? mostRecent.endTime : addMinutes(startTime, durationMinutes)

    const block = await createNode(userId, 'TimeBlock', { date, startTime, endTime })
    await createEdge(userId, block.id, habit.id, 'scheduled-for', {})
  }
}

const DEFAULT_TASK_MINUTES = 30

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Places due and overdue tasks into whatever time is actually free.
 *
 * This is the counterpart to autoFillHabitsForDate, and the reason it exists:
 * habits already scheduled themselves while every task had to be dragged onto
 * the calendar by hand — leaving "when do I do this" as a question the user
 * still had to answer for everything they owned.
 *
 * Only ever *adds* to free gaps. Existing blocks and events are treated as
 * immovable, so nothing the user placed deliberately is displaced, and a task
 * that will not fit is simply left unscheduled rather than double-booked.
 */
async function autoScheduleTasksForDate(
  userId: number,
  date: string,
  workingHours: { start: string; end: string },
) {
  const tasks = await getNodes(userId, { type: 'Task' })
  if (tasks.length === 0) return

  const scheduledForEdges = await getEdges(userId, { type: 'scheduled-for' })
  const timeBlocks = await getNodes(userId, { type: 'TimeBlock' })
  const blockById = new Map(timeBlocks.map((b) => [b.id, b]))

  // A task already sitting on any day's calendar is left alone — rescheduling
  // something the user has already placed would be the opposite of helpful.
  const scheduledNodeIds = new Set(
    scheduledForEdges
      .filter((e) => blockById.has(e.sourceId))
      .map((e) => e.targetId),
  )

  const candidates = tasks
    .map((t) => {
      const p = t.properties as Record<string, unknown>
      return {
        node: t,
        name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${t.id}`,
        status: typeof p.status === 'string' ? p.status : 'todo',
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
        priority: typeof p.priority === 'string' ? p.priority : 'medium',
        minutes: typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0
          ? p.estimatedMinutes
          : DEFAULT_TASK_MINUTES,
      }
    })
    // Due today or already late. Anything further out is not yet this day's
    // problem, and filling the week ahead would bury the things that matter now.
    .filter((t) => t.status !== 'done' && t.dueDate !== null && t.dueDate <= date)
    .filter((t) => !scheduledNodeIds.has(t.node.id))

  if (candidates.length === 0) return

  // Most overdue first, then by priority — the order someone would pick if
  // they were doing this by hand.
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  candidates.sort((a, b) => {
    const dateDiff = (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
    if (dateDiff !== 0) return dateDiff
    return (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1)
  })

  // Everything already committed on this day, as busy intervals.
  const busy: { start: number; end: number }[] = []
  for (const block of timeBlocks) {
    const p = block.properties as Record<string, unknown>
    if (p.date !== date) continue
    if (typeof p.startTime === 'string' && typeof p.endTime === 'string') {
      busy.push({ start: toMinutes(p.startTime), end: toMinutes(p.endTime) })
    }
  }
  for (const event of await getNodes(userId, { type: 'Event' })) {
    const p = event.properties as Record<string, unknown>
    if (p.date !== date || typeof p.time !== 'string') continue
    const start = toMinutes(p.time)
    busy.push({ start, end: start + (typeof p.duration === 'number' ? p.duration : 60) })
  }
  busy.sort((a, b) => a.start - b.start)

  const dayStart = toMinutes(workingHours.start)
  const dayEnd = toMinutes(workingHours.end)

  // On today itself, nothing is scheduled into hours that have already gone.
  const now = new Date()
  const isToday = date === todayStr()
  const earliest = isToday
    ? Math.max(dayStart, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15)
    : dayStart

  let cursor = earliest
  for (const task of candidates) {
    let placed = false
    while (!placed && cursor + task.minutes <= dayEnd) {
      const end = cursor + task.minutes
      const clash = busy.find((b) => cursor < b.end && end > b.start)
      if (clash) {
        cursor = clash.end // jump past whatever is in the way and try again
        continue
      }
      const block = await createNode(userId, 'TimeBlock', {
        date,
        startTime: fromMinutes(cursor),
        endTime: fromMinutes(end),
        autoScheduled: true, // so it is recognisable as the app's guess, not the user's decision
      })
      await createEdge(userId, block.id, task.node.id, 'scheduled-for', {})
      busy.push({ start: cursor, end })
      busy.sort((a, b) => a.start - b.start)
      cursor = end
      placed = true
    }
    if (!placed) break // the day is full; the rest stay unscheduled
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? todayStr()

  // Today or any future day — never a past one, so browsing history never
  // fabricates an entry that wasn't actually there.
  if (date >= todayStr()) {
    await autoFillHabitsForDate(user.id, date)

    // Opt-in: filling someone's calendar unasked would be a surprise, so this
    // stays off until it is switched on in Settings.
    const settingsNodes = await getNodes(user.id, { type: 'Settings' })
    const settings = (settingsNodes[0]?.properties ?? {}) as {
      autoScheduleTasks?: boolean
      workingHours?: { start: string; end: string }
    }
    if (settings.autoScheduleTasks) {
      await autoScheduleTasksForDate(
        user.id,
        date,
        settings.workingHours ?? { start: '09:00', end: '18:00' },
      )
    }
  }

  // TimeBlocks for the requested date
  const allBlocks = (await getNodes(user.id, { type: 'TimeBlock' })).filter((n) => {
    const p = n.properties as Record<string, unknown>
    return p.date === date
  })

  // Find scheduled-for edges where source is one of our blocks
  const blockIds = new Set(allBlocks.map((b) => b.id))
  const scheduledEdges = (await getEdges(user.id, { type: 'scheduled-for' })).filter((e) =>
    blockIds.has(e.sourceId),
  )

  // Build sourceNodeId lookup: blockId -> sourceNodeId
  const sourceByBlock = new Map<number, number>()
  for (const edge of scheduledEdges) {
    sourceByBlock.set(edge.sourceId, edge.targetId)
  }

  // Fetch source nodes
  const sourceNodeIds = new Set(sourceByBlock.values())
  const sourceNodes = new Map<number, { id: number; type: string; name: string }>()
  for (const id of sourceNodeIds) {
    const node = await getNodeById(user.id, id)
    if (node) {
      const p = node.properties as Record<string, unknown>
      sourceNodes.set(id, {
        id: node.id,
        type: node.type,
        name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${node.type} #${node.id}`,
      })
    }
  }

  const blocks = allBlocks.map((n) => {
    const p = n.properties as Record<string, unknown>
    const sourceNodeId = sourceByBlock.get(n.id)
    return {
      id: n.id,
      startTime: typeof p.startTime === 'string' ? p.startTime : '00:00',
      endTime: typeof p.endTime === 'string' ? p.endTime : '01:00',
      source: sourceNodeId ? sourceNodes.get(sourceNodeId) ?? null : null,
    }
  }).sort((a, b) => a.startTime.localeCompare(b.startTime))

  // Events for the requested date
  const events = (await getNodes(user.id, { type: 'Event' }))
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        name: typeof p.name === 'string' ? p.name : `Event #${n.id}`,
        date: typeof p.date === 'string' ? p.date : null,
        time: typeof p.time === 'string' ? p.time : null,
        duration: typeof p.duration === 'number' ? p.duration : null,
        location: typeof p.location === 'string' ? p.location : null,
      }
    })
    .filter((e) => e.date === date)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  return Response.json({ date, blocks, events })
}
