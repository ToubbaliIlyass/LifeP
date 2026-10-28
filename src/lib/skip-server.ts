import { getNodeById, updateNode } from '@/lib/graph/queries'
import { moveTaskTime } from '@/lib/task-time'
import { skipOccurrence, unskipOccurrence } from '@/lib/skip'

export type SkipOutcome =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: string }

/**
 * Skips (or, with `undo`, restores) one time round of a repeating to-do,
 * and moves a time set by hand along with it. Shared by the screen's route
 * and the assistant's tool, so both do exactly the same thing. The caller
 * passes the user's own `today` (src/lib/clock.ts).
 */
export async function skipTask(
  userId: number,
  taskId: number,
  opts: { today: string; date?: string; undo?: boolean },
): Promise<SkipOutcome> {
  const node = await getNodeById(userId, taskId)
  if (!node || node.type !== 'Task') return { ok: false, reason: 'not-found' }
  const props = node.properties as Record<string, unknown>
  const result = opts.undo ? unskipOccurrence(props, opts.date ?? '') : skipOccurrence(props, opts.today, opts.date)
  if (!result.ok) return result
  await updateNode(userId, taskId, result.props)
  if (opts.undo) await moveTaskTime(userId, taskId, result.to, result.from)
  else await moveTaskTime(userId, taskId, result.from, result.to)
  return { ok: true, from: result.from, to: result.to }
}
