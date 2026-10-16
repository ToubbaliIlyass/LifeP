import { createEdge, createNode, deleteNode, getEdges, getNodes, updateNode } from '@/lib/graph/queries'
import { firmnessOf } from '@/lib/sessions'
import { fromMinutes, toMinutes, DEFAULT_TASK_MINUTES } from '@/lib/schedule'
import type { Node } from '@/lib/db/schema'

/**
 * A to-do's time on its day, stored the way the planner already stores one:
 * a TimeBlock with a `scheduled-for` edge to the task. So a time set by hand,
 * a time the assistant chose and a time "Plan my day" chose are the same
 * thing, everything that reads the day sees it, and the planner plans around
 * it.
 *
 * A time set here is `hard`: the user said when, and replanning may never
 * move it. One the planner chose is `tentative` until the user touches it.
 */

/** The one-day blocks holding this task on `day`. Routine blocks are left alone. */
async function blocksFor(userId: number, taskId: number, day: string): Promise<Node[]> {
  const [edges, blocks] = await Promise.all([
    getEdges(userId, { targetId: taskId, type: 'scheduled-for' }),
    getNodes(userId, { type: 'TimeBlock' }),
  ])
  const ids = new Set(edges.map((e) => e.sourceId))
  return blocks.filter((b) => {
    const p = b.properties as Record<string, unknown>
    return ids.has(b.id) && p.date === day && (p.frequency === undefined || p.frequency === 'once')
  })
}

/** Gives the task a time on `day` (or takes it away, with `time: null`). */
export async function setTaskTime(
  userId: number,
  taskId: number,
  day: string,
  { time, minutes }: { time?: string | null; minutes?: number | null },
): Promise<void> {
  const existing = await blocksFor(userId, taskId, day)
  if (time === null) {
    for (const b of existing) await deleteNode(userId, b.id)
    return
  }
  const [block, ...extra] = existing
  const p = (block?.properties ?? {}) as Record<string, unknown>
  const start = time ?? (typeof p.startTime === 'string' ? p.startTime : null)
  if (!start) return // a length with no time yet: kept on the task, nothing to place
  const length = minutes && minutes > 0 ? minutes
    : typeof p.startTime === 'string' && typeof p.endTime === 'string' ? toMinutes(p.endTime) - toMinutes(p.startTime)
    : DEFAULT_TASK_MINUTES
  // Kept on the day: a late evening task runs to midnight rather than into tomorrow.
  const end = fromMinutes(Math.min(toMinutes(start) + length, 23 * 60 + 59))
  const props = { ...p, date: day, startTime: start, endTime: end, firmness: 'hard', autoScheduled: false }
  if (block) await updateNode(userId, block.id, props)
  else {
    const created = await createNode(userId, 'TimeBlock', props)
    await createEdge(userId, created.id, taskId, 'scheduled-for')
  }
  // Two blocks for one task on one day is a plan contradicting itself.
  for (const b of extra) await deleteNode(userId, b.id)
}

/**
 * The task moved to another day: its time goes with it. Moved off every day
 * (back to the Inbox, or Someday), a time it was given by hand is kept for
 * nothing, so it is cleared; the planner's own guesses are cleared too.
 */
export async function moveTaskTime(userId: number, taskId: number, from: string, to: string | null): Promise<void> {
  if (from === to) return
  for (const b of await blocksFor(userId, taskId, from)) {
    const p = b.properties as Record<string, unknown>
    if (to && firmnessOf(p) === 'hard') await updateNode(userId, b.id, { ...p, date: to })
    else await deleteNode(userId, b.id)
  }
}
