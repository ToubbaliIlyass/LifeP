import { createNode, getNodeById, updateNode } from '@/lib/graph/queries'
import { nextDueDate, todayStr } from '@/lib/date'
import type { Node } from '@/lib/db/schema'

interface Recurrence { frequency: 'daily' | 'weekly' | 'weekdays'; daysOfWeek?: number[] }

export interface StatusChange {
  task: Node
  previous: string
  /** The next occurrence, when completing a recurring task created one. */
  spawned: { id: number } | null
}

/**
 * Changes a task's status, with everything that has to come with it.
 *
 * Shared by the task list and by the assistant logging "I finished X": two
 * ways of saying the same thing have to do the same thing. In particular a
 * recurring task must hand off to its next occurrence however it was
 * completed — done from chat and it would otherwise quietly stop recurring.
 *
 * Learning signals are the caller's business, because only the caller knows
 * whether this was a click or a report, and when it really happened.
 */
export async function setTaskStatus(userId: number, taskId: number, status: string): Promise<StatusChange | null> {
  const task = await getNodeById(userId, taskId)
  if (!task || task.type !== 'Task') return null

  const props = { ...(task.properties as Record<string, unknown>) }
  const previous = typeof props.status === 'string' ? props.status : 'todo'

  // Track transition timestamp for archive logic
  if (status === 'done' && previous !== 'done') {
    props.completedAt = new Date().toISOString()
  } else if (status !== 'done') {
    delete props.completedAt
  }
  props.status = status

  const updated = (await updateNode(userId, taskId, props)) ?? task

  // A recurring Task completing shouldn't just vanish — it should hand off
  // to its next occurrence, the same way a recurring Habit is never a
  // one-shot. Only fires on the todo/in-progress -> done transition, never
  // on undo, so toggling done/undone repeatedly can't spawn duplicates.
  const recurrence = props.recurrence as Recurrence | undefined
  let spawned: { id: number } | null = null
  if (status === 'done' && previous !== 'done' && recurrence?.frequency) {
    const baseDate = typeof props.dueDate === 'string' ? props.dueDate : todayStr()
    const next = nextDueDate(baseDate, recurrence.frequency, recurrence.daysOfWeek ?? null)
    // A deadline is where a repeating to-do stops: "review every day, due
    // Wednesday" means every day up to Wednesday, and nothing after it.
    const deadline = typeof props.deadline === 'string' ? props.deadline : null
    if (!deadline || next <= deadline) {
      const created = await createNode(userId, 'Task', {
        ...props,
        status: 'todo',
        dueDate: next,
        completedAt: undefined,
        // Each occurrence starts with its checklist unticked.
        ...(Array.isArray(props.checklist)
          ? { checklist: (props.checklist as Record<string, unknown>[]).map((c) => ({ ...c, done: false })) }
          : {}),
      })
      spawned = { id: created.id }
    }
  }

  return { task: updated, previous, spawned }
}
