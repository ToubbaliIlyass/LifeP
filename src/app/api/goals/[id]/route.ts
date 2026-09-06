import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodeWithNeighbors, getNodes } from '@/lib/graph/queries'
import { todayStr, addDays } from '@/lib/date'
import type { Node } from '@/lib/db/schema'

function label(node: Node): string {
  const p = node.properties as Record<string, unknown>
  if (typeof p.name === 'string') return p.name
  if (typeof p.title === 'string') return p.title
  if (typeof p.label === 'string') return p.label
  if (typeof p.content === 'string') return p.content.slice(0, 60)
  return `${node.type} #${node.id}`
}

/**
 * Everything attached to one goal, grouped by the role each neighbour plays.
 *
 * Every relationship carries its edgeId so the UI can unlink it — without
 * that, connections could be made but never undone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { id: idStr } = await params
  const goalId = parseInt(idStr, 10)
  if (isNaN(goalId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const detail = await getNodeWithNeighbors(user.id, goalId)
  if (!detail || detail.node.type !== 'Goal') {
    return Response.json({ error: 'Goal not found' }, { status: 404 })
  }

  const habitLogs = await getNodes(user.id, { type: 'HabitLog' })
  const since = addDays(todayStr(), -7)

  const milestones = []
  const habits = []
  const notes = []
  const other = []
  // Linked Tasks still move the progress bar — they are real work towards the
  // goal — but they are listed among the other linked nodes rather than as
  // milestones, which are now their own type.
  const linkedTasks: { done: boolean }[] = []

  for (const { node, edge, direction } of detail.neighbors) {
    const base = { id: node.id, label: label(node), edgeId: edge.id, edgeType: edge.type, direction }
    const p = node.properties as Record<string, unknown>

    if (node.type === 'Milestone') {
      milestones.push({
        ...base,
        status: typeof p.status === 'string' ? p.status : 'todo',
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
      })
    } else if (node.type === 'Task') {
      linkedTasks.push({ done: p.status === 'done' })
      other.push({ ...base, type: node.type })
    } else if (node.type === 'Habit') {
      // Same "on track" rule the progress bar uses: logged complete at least
      // once in the last week.
      const recentlyDone = habitLogs.some((l) => {
        const lp = l.properties as Record<string, unknown>
        return lp.habitNodeId === node.id && typeof lp.date === 'string' && lp.date >= since && lp.completed === true
      })
      habits.push({ ...base, frequency: typeof p.frequency === 'string' ? p.frequency : 'daily', recentlyDone })
    } else if (node.type === 'Note' || node.type === 'JournalEntry') {
      notes.push({ ...base, content: typeof p.content === 'string' ? p.content : '' })
    } else {
      other.push({ ...base, type: node.type })
    }
  }

  const counted = [...milestones, ...linkedTasks, ...habits]
  const done =
    milestones.filter((m) => m.status === 'done').length +
    linkedTasks.filter((t) => t.done).length +
    habits.filter((h) => h.recentlyDone).length

  return Response.json({
    goal: {
      id: detail.node.id,
      properties: detail.node.properties,
      createdAt: detail.node.createdAt,
      updatedAt: detail.node.updatedAt,
    },
    progress: counted.length > 0 ? Math.round((done / counted.length) * 100) : null,
    milestones,
    habits,
    notes,
    other,
  })
}
