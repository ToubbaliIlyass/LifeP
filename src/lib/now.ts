import { isDueOn, eventOccursOn } from '@/lib/date'
import { toMinutes, DEFAULT_TASK_MINUTES } from '@/lib/schedule'
import type { Node, Edge } from '@/lib/db/schema'

export interface NowItem {
  id: number
  kind: 'block' | 'event' | 'habit' | 'task'
  label: string
  /** HH:MM, or null for things with no appointed time. */
  startTime: string | null
  endTime: string | null
  minutes: number | null
  /** The node to act on — a block's underlying task/habit, not the block. */
  targetId: number | null
  targetType: string | null
  note: string | null
}

function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/**
 * Merges everything happening today into one ordered sequence.
 *
 * Pure, so the merge rules can be exercised directly — the important one
 * being that something already on the calendar appears once, as a timed
 * block, and never again in the untimed list.
 */
export function buildNowQueue({
  date,
  tasks,
  habits,
  habitLogs,
  events,
  timeBlocks,
  scheduledEdges,
}: {
  date: string
  tasks: Node[]
  habits: Node[]
  habitLogs: Node[]
  events: Node[]
  timeBlocks: Node[]
  scheduledEdges: Edge[]
}): NowItem[] {
  const dow = new Date(date + 'T00:00:00').getDay()
  const nodeById = new Map([...tasks, ...habits].map((n) => [n.id, n]))

  const habitDoneToday = (habitId: number) =>
    habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === habitId && lp.date === date && lp.completed === true
    })

  const describe = (id: number) => {
    const n = nodeById.get(id)
    if (!n) return null
    const p = n.properties as Record<string, unknown>
    return {
      label: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${n.type} #${n.id}`,
      type: n.type,
      // A habit has no status — its completion lives in a HabitLog. Reading
      // `status` for both is why ticking a habit off the queue used to leave
      // it sitting there: the check could never be true for a habit, and
      // habits reach this queue as calendar blocks because they are
      // auto-filled onto the day.
      done: n.type === 'Habit' ? habitDoneToday(n.id) : p.status === 'done',
    }
  }

  const items: NowItem[] = []
  const scheduledTargets = new Set<number>()

  const blocksToday = timeBlocks.filter((b) => (b.properties as Record<string, unknown>).date === date)
  for (const block of blocksToday) {
    const p = block.properties as Record<string, unknown>
    const edge = scheduledEdges.find((e) => e.sourceId === block.id)
    const target = edge ? describe(edge.targetId) : null
    if (edge) scheduledTargets.add(edge.targetId)
    if (target?.done) continue

    const start = typeof p.startTime === 'string' ? p.startTime : null
    const end = typeof p.endTime === 'string' ? p.endTime : null
    items.push({
      id: block.id,
      kind: 'block',
      label: target?.label ?? 'Time block',
      startTime: start,
      endTime: end,
      minutes: start && end ? toMinutes(end) - toMinutes(start) : null,
      targetId: edge?.targetId ?? null,
      targetType: target?.type ?? null,
      note: p.autoScheduled ? 'scheduled for you' : null,
    })
  }

  for (const event of events) {
    const p = event.properties as Record<string, unknown>
    // Recurring events have one node and many occurrences, so the rule is
    // asked rather than the stored date compared.
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
    const start = typeof p.time === 'string' ? p.time : null
    const minutes = typeof p.duration === 'number' ? p.duration : 60
    items.push({
      id: event.id,
      kind: 'event',
      label: typeof p.name === 'string' ? p.name : `Event #${event.id}`,
      startTime: start,
      endTime: start ? minutesToTime(toMinutes(start) + minutes) : null,
      minutes,
      targetId: event.id,
      targetType: 'Event',
      note: typeof p.location === 'string' && p.location ? p.location : null,
    })
  }

  for (const habit of habits) {
    const p = habit.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    if (!isDueOn(frequency, daysOfWeek, dow)) continue
    if (scheduledTargets.has(habit.id)) continue

    const logged = habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === habit.id && lp.date === date && lp.completed === true
    })
    if (logged) continue

    items.push({
      id: habit.id,
      kind: 'habit',
      label: typeof p.name === 'string' ? p.name : `Habit #${habit.id}`,
      startTime: null,
      endTime: null,
      minutes: typeof p.durationMinutes === 'number' ? p.durationMinutes : null,
      targetId: habit.id,
      targetType: 'Habit',
      note: null,
    })
  }

  for (const task of tasks) {
    const p = task.properties as Record<string, unknown>
    const status = typeof p.status === 'string' ? p.status : 'todo'
    const dueDate = typeof p.dueDate === 'string' ? p.dueDate : null
    if (status === 'done' || !dueDate || dueDate > date) continue
    if (scheduledTargets.has(task.id)) continue

    items.push({
      id: task.id,
      kind: 'task',
      label: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${task.id}`,
      startTime: null,
      endTime: null,
      minutes: typeof p.estimatedMinutes === 'number' ? p.estimatedMinutes : DEFAULT_TASK_MINUTES,
      targetId: task.id,
      targetType: 'Task',
      note: dueDate < date ? 'overdue' : null,
    })
  }

  // Timed things in time order; the rest after, since they can happen in any
  // gap.
  items.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
    if (a.startTime) return -1
    if (b.startTime) return 1
    return 0
  })

  return items
}
