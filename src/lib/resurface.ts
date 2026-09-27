import type { Edge, Node } from '@/lib/db/schema'

/**
 * Things that have gone quiet.
 *
 * A planner is very good at showing what is due and very bad at showing what
 * has been forgotten — the goal nobody has touched since February, the note
 * that turned out to matter, the project that quietly stalled. Nothing is
 * overdue about any of them, so nothing ever surfaces them, and they rot in
 * a list the user stops opening.
 *
 * So: work out when each thing was last *touched*, and offer back whatever
 * has been silent too long. Touched deliberately includes activity on
 * anything linked to it — a goal whose tasks were worked on last week is
 * alive, even though the goal node itself has not been edited in months.
 *
 * Pure, so the rules can be exercised directly against fixed data rather
 * than by waiting three weeks.
 */

/** Bookkeeping nodes, not things the user thinks about. Mirrors layout.ts. */
const BOOKKEEPING = new Set([
  'habitlog', 'timeblock', 'savedview', 'settings',
  'memory', 'availabilityrule', 'activitysignal', 'apitoken',
  'proposal', 'nodetype',
])

export type ResurfaceKind = 'goal' | 'project' | 'course' | 'task' | 'note' | 'habit' | 'content' | 'other'

export interface ResurfaceItem {
  id: number
  type: string
  kind: ResurfaceKind
  name: string
  /** YYYY-MM-DD of the most recent sign of life, its own or a neighbour's. */
  lastTouched: string
  daysSince: number
  /** Plain words for why it is being shown. */
  reason: string
  /** Higher sorts first. */
  weight: number
}

const KIND_BY_TYPE: Record<string, ResurfaceKind> = {
  Goal: 'goal',
  Project: 'project',
  Course: 'course',
  Task: 'task',
  Assignment: 'task',
  Note: 'note',
  JournalEntry: 'note',
  Habit: 'habit',
  ContentPiece: 'content',
  ContentSeries: 'content',
}

/** How loudly each kind asks to be looked at, all else being equal. */
const KIND_WEIGHT: Record<ResurfaceKind, number> = {
  goal: 5, project: 4, course: 3, content: 3, task: 2, note: 2, habit: 3, other: 1,
}

const nameOf = (p: Record<string, unknown>, fallback: string) =>
  typeof p.name === 'string' ? p.name
    : typeof p.title === 'string' ? p.title
    : typeof p.label === 'string' ? p.label
    : fallback

const day = (iso: string) => iso.slice(0, 10)

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime()
  const b = new Date(to + 'T00:00:00').getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/**
 * Whether this is a thing that can still be got on with. Finished, abandoned
 * and archived things are supposed to be quiet.
 */
function isOpen(node: Node): boolean {
  const p = node.properties as Record<string, unknown>
  if (p.archived === true) return false
  if (p.resurface === false) return false // dismissed for good by the user
  const status = typeof p.status === 'string' ? p.status : null
  if (status && ['done', 'completed', 'cancelled', 'abandoned', 'ended'].includes(status)) return false
  if (node.type === 'ContentPiece' && p.stage === 'published') return false
  return true
}

export interface ResurfaceInput {
  today: string
  /** Untouched for at least this long before anything is offered back. */
  days: number
  nodes: Node[]
  edges: Edge[]
  habitLogs: Node[]
}

export function findResurfaced({ today, days, nodes, edges, habitLogs }: ResurfaceInput): ResurfaceItem[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // Neighbours, both directions: activity anywhere on a thing counts as
  // activity on the thing.
  const neighbours = new Map<number, number[]>()
  const add = (from: number, to: number) => {
    const list = neighbours.get(from)
    if (list) list.push(to)
    else neighbours.set(from, [to])
  }
  for (const e of edges) { add(e.sourceId, e.targetId); add(e.targetId, e.sourceId) }

  // A habit's life is in its logs, which are not edges.
  const lastLogByHabit = new Map<number, string>()
  for (const log of habitLogs) {
    const p = log.properties as Record<string, unknown>
    if (typeof p.habitNodeId !== 'number' || typeof p.date !== 'string') continue
    const current = lastLogByHabit.get(p.habitNodeId)
    if (!current || p.date > current) lastLogByHabit.set(p.habitNodeId, p.date)
  }

  const items: ResurfaceItem[] = []

  for (const node of nodes) {
    if (BOOKKEEPING.has(node.type.toLowerCase())) continue
    // Unknown user-defined types still count, but Events do not: one that
    // has happened is over, and one that has not is already on the calendar.
    if (node.type === 'Event') continue
    if (!isOpen(node)) continue

    const p = node.properties as Record<string, unknown>
    const kind = KIND_BY_TYPE[node.type] ?? 'other'

    let lastTouched = day(node.updatedAt)
    // An explicit "yes, still relevant" from the review outranks everything.
    if (typeof p.reviewedAt === 'string' && day(p.reviewedAt) > lastTouched) lastTouched = day(p.reviewedAt)

    for (const neighbourId of neighbours.get(node.id) ?? []) {
      const neighbour = byId.get(neighbourId)
      if (!neighbour || BOOKKEEPING.has(neighbour.type.toLowerCase())) continue
      const touched = day(neighbour.updatedAt)
      if (touched > lastTouched) lastTouched = touched
    }

    if (kind === 'habit') {
      const logged = lastLogByHabit.get(node.id)
      if (logged && logged > lastTouched) lastTouched = logged
    }

    const daysSince = daysBetween(lastTouched, today)
    if (daysSince < days) continue

    const name = nameOf(p, `${node.type} #${node.id}`)
    const weeks = Math.floor(daysSince / 7)
    const ago = weeks >= 8 ? `${Math.floor(daysSince / 30)} months` : weeks >= 2 ? `${weeks} weeks` : `${daysSince} days`

    const reason =
      kind === 'goal' ? `Nothing linked to this has moved in ${ago}`
        : kind === 'habit' ? `Not logged in ${ago}`
        : kind === 'note' ? `Written ${ago} ago and not looked at since`
        : kind === 'content' ? `Stuck at "${typeof p.stage === 'string' ? p.stage : 'idea'}" for ${ago}`
        : kind === 'task' ? `Still open, untouched for ${ago}`
        : `No activity in ${ago}`

    // Older is louder, but only up to a point: at some age everything is
    // equally forgotten and the kind is what should decide the order.
    items.push({
      id: node.id,
      type: node.type,
      kind,
      name,
      lastTouched,
      daysSince,
      reason,
      weight: KIND_WEIGHT[kind] * 10 + Math.min(daysSince / days, 3),
    })
  }

  return items.sort((a, b) => b.weight - a.weight || b.daysSince - a.daysSince)
}
