import { getNodes, getEdges } from '@/lib/graph/queries'
import { buildNowQueue, buildTodayHabits } from '@/lib/now'
import { readSettings } from '@/lib/settings'
import { workTypes } from '@/lib/modules'

/**
 * One day, as the assistant reads it back: what is on the clock, what still
 * needs a time, and the habits due.
 *
 * Built from the same queue the Today page draws, so "what do I have today?"
 * answered in the chat is the day on screen, not a second opinion of it.
 */
export async function dayView(userId: number, date: string) {
  const settings = await readSettings(userId)
  const [nodes, scheduledEdges] = await Promise.all([getNodes(userId), getEdges(userId, { type: 'scheduled-for' })])
  const of = (type: string) => nodes.filter((n) => n.type === type)
  const dated = workTypes(settings)

  const queue = buildNowQueue({
    date,
    tasks: of('Task'),
    habits: of('Habit'),
    habitLogs: of('HabitLog'),
    events: of('Event'),
    timeBlocks: of('TimeBlock'),
    scheduledEdges,
    dueItems: nodes.filter((n) => dated.has(n.type)),
  })

  return {
    date,
    onTheClock: queue
      .filter((i) => i.startTime)
      .map((i) => ({
        start: i.startTime,
        end: i.endTime,
        what: i.children?.length ? `${i.label}: ${i.children.map((c) => c.name).join(', ')}` : i.label,
        kind: i.kind === 'block' ? (i.targetType ?? 'block').toLowerCase() : i.kind,
        ...(i.completed ? { done: true } : {}),
      })),
    stillNeedsATime: queue
      .filter((i) => !i.startTime && i.kind !== 'habit')
      .map((i) => ({ what: i.label, kind: i.targetType?.toLowerCase() ?? i.kind, ...(i.note === 'overdue' ? { overdue: true } : {}) })),
    habits: buildTodayHabits({
      date,
      habits: of('Habit'),
      habitLogs: of('HabitLog'),
      timeBlocks: of('TimeBlock'),
      scheduledEdges,
    }).map((h) => ({ name: h.name, done: h.done })),
  }
}
