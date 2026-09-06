import { getNodes, getEdges } from '@/lib/graph/queries'
import { todayStr, eventOccursOn, isDueOn } from '@/lib/date'
import {
  planSchedule,
  toMinutes,
  DEFAULT_TASK_MINUTES,
  DEFAULT_HABIT_MINUTES,
  type BusyInterval,
  type Placement,
  type SchedulableTask,
} from '@/lib/schedule'

/**
 * Reads a day out of the database and works out what could be scheduled into
 * it. Shared by the suggestion endpoint and the apply endpoint so the plan a
 * user approves is the plan that gets written.
 */
export async function planDay(
  userId: number,
  date: string,
  workingHours: { start: string; end: string },
  /**
   * 'habits' plans only the habits, leaving tasks where they are. Used when
   * re-laying out habits on their own, so accepting a fresh habit layout
   * cannot quietly move work the user had already placed.
   */
  include: 'all' | 'habits' = 'all',
): Promise<Placement[]> {
  const tasks = include === 'habits' ? [] : await getNodes(userId, { type: 'Task' })

  const scheduledForEdges = await getEdges(userId, { type: 'scheduled-for' })
  const timeBlocks = await getNodes(userId, { type: 'TimeBlock' })
  const blockById = new Map(timeBlocks.map((b) => [b.id, b]))

  // Anything already on the calendar, any day, is left alone — re-placing
  // something the user has already dealt with would be the opposite of help.
  const alreadyScheduled = new Set(
    scheduledForEdges.filter((e) => blockById.has(e.sourceId)).map((e) => e.targetId),
  )

  const candidates: SchedulableTask[] = tasks
    .map((t) => {
      const p = t.properties as Record<string, unknown>
      return {
        id: t.id,
        name:
          typeof p.name === 'string' ? p.name
            : typeof p.title === 'string' ? p.title
            : `Task #${t.id}`,
        status: typeof p.status === 'string' ? p.status : 'todo',
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
        priority: typeof p.priority === 'string' ? p.priority : 'medium',
        minutes:
          typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0
            ? p.estimatedMinutes
            : DEFAULT_TASK_MINUTES,
      }
    })
    // Due by this day or already late. Anything further out is not yet this
    // day's problem, and pulling it forward would bury what matters now.
    .filter((t) => t.status !== 'done' && t.dueDate !== null && t.dueDate <= date)
    .filter((t) => !alreadyScheduled.has(t.id))
    .map(({ id, name, dueDate, priority, minutes }) => ({
      id, name, dueDate, priority, minutes, kind: 'task' as const, preferredStart: null,
    }))

  /*
   * Habits belong in the plan, not stamped onto the calendar behind the user's
   * back. They used to be written straight in at a hardcoded 08:00 the moment
   * a day was opened — outside the working day, all on the same slot, and
   * never approved by anyone. Now they go through exactly the same suggestion
   * the tasks do, so a time is proposed and the user says yes.
   *
   * "Already scheduled" is per-day for a habit (it recurs) but any-day for a
   * task (it does not).
   */
  const scheduledOnThisDate = new Set(
    scheduledForEdges
      .filter((e) => {
        const block = blockById.get(e.sourceId)
        return block && (block.properties as Record<string, unknown>).date === date
      })
      .map((e) => e.targetId),
  )

  const dow = new Date(date + 'T00:00:00').getDay()
  const habitLogs = await getNodes(userId, { type: 'HabitLog' })

  for (const habit of await getNodes(userId, { type: 'Habit' })) {
    const p = habit.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    if (!isDueOn(frequency, daysOfWeek, dow)) continue
    if (scheduledOnThisDate.has(habit.id)) continue

    /*
     * Some habits belong to the day rather than to a time in it — praying
     * five times, drinking water, standing up now and then. Giving those a
     * block is a category error: it invents a commitment that was never
     * made, and eats space real appointments need. They stay in the Now
     * queue as untimed, where they can be ticked off whenever they happen.
     */
    if (p.anytime === true) continue

    const done = habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === habit.id && lp.date === date && lp.completed === true
    })
    if (done) continue

    // A habit recorded as taking no time still needs a slot with a height.
    const stated = typeof p.durationMinutes === 'number' ? p.durationMinutes : 0
    const minutes = stated > 0 ? stated : DEFAULT_HABIT_MINUTES

    // The time it was last given, if it has one — see preferredStart.
    const previous = scheduledForEdges
      .filter((e) => e.targetId === habit.id)
      .map((e) => blockById.get(e.sourceId))
      .map((b) => (b ? (b.properties as Record<string, unknown>) : null))
      .filter((bp): bp is Record<string, unknown> => !!bp && typeof bp.date === 'string' && (bp.date as string) < date)
      .sort((a, b) => (b.date as string).localeCompare(a.date as string))[0]

    const preferredStart =
      previous && typeof previous.startTime === 'string' ? toMinutes(previous.startTime) : null

    candidates.push({
      id: habit.id,
      name: typeof p.name === 'string' ? p.name : `Habit #${habit.id}`,
      dueDate: null,
      priority: 'medium',
      minutes,
      kind: 'habit',
      preferredStart,
    })
  }

  if (candidates.length === 0) return []

  const busy: BusyInterval[] = []
  for (const block of timeBlocks) {
    const p = block.properties as Record<string, unknown>
    if (p.date !== date) continue
    if (typeof p.startTime === 'string' && typeof p.endTime === 'string') {
      busy.push({ start: toMinutes(p.startTime), end: toMinutes(p.endTime) })
    }
  }
  for (const event of await getNodes(userId, { type: 'Event' })) {
    const p = event.properties as Record<string, unknown>
    if (typeof p.time !== 'string') continue
    const occurs = eventOccursOn(
      {
        date: typeof p.date === 'string' ? p.date : null,
        frequency: typeof p.frequency === 'string' ? p.frequency : null,
        daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
        until: typeof p.until === 'string' ? p.until : null,
      },
      date,
    )
    if (!occurs) continue
    const start = toMinutes(p.time)
    busy.push({ start, end: start + (typeof p.duration === 'number' ? p.duration : 60) })
  }

  // On today itself, hours that have already gone are not available.
  const now = new Date()
  const earliestMinutes =
    date === todayStr()
      ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15
      : undefined

  /*
   * Spread rather than packed. Everything placed back to back from the start
   * of the day is how eight habits ended up in one unreadable stack; sharing
   * the day's spare minutes between them gives each one room and makes the
   * plan look like a day someone would actually live. Capped so a nearly
   * empty day does not fling two items twelve hours apart.
   */
  const needed = candidates.reduce((sum, c) => sum + c.minutes, 0)
  const windowStart = Math.max(toMinutes(workingHours.start), earliestMinutes ?? 0)
  const spare = toMinutes(workingHours.end) - windowStart
    - busy.reduce((sum, b) => sum + Math.max(0, Math.min(b.end, toMinutes(workingHours.end)) - Math.max(b.start, windowStart)), 0)
    - needed
  const gapMinutes =
    candidates.length > 1 ? Math.max(0, Math.min(60, Math.floor(spare / candidates.length))) : 0

  return planSchedule({ tasks: candidates, busy, workingHours, earliestMinutes, gapMinutes })
}
