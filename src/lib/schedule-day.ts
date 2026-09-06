import { getNodes, getEdges } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'
import {
  planSchedule,
  toMinutes,
  DEFAULT_TASK_MINUTES,
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
): Promise<Placement[]> {
  const tasks = await getNodes(userId, { type: 'Task' })
  if (tasks.length === 0) return []

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
    .map(({ id, name, dueDate, priority, minutes }) => ({ id, name, dueDate, priority, minutes }))

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
    if (p.date !== date || typeof p.time !== 'string') continue
    const start = toMinutes(p.time)
    busy.push({ start, end: start + (typeof p.duration === 'number' ? p.duration : 60) })
  }

  // On today itself, hours that have already gone are not available.
  const now = new Date()
  const earliestMinutes =
    date === todayStr()
      ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15
      : undefined

  return planSchedule({ tasks: candidates, busy, workingHours, earliestMinutes })
}
