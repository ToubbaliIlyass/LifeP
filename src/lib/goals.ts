import type { Edge, Node } from '@/lib/db/schema'

/**
 * What counts as work on a goal.
 *
 * Both the Goals panel and the weekly review used to answer this with
 * "linked Tasks and Habits", and that answer was wrong in a way that showed:
 * a goal whose work is organised into Projects — which is how anything
 * larger than a chore gets organised — has no linked Task or Habit at all,
 * so it reported no progress and no activity, and the review filed it under
 * stale while its projects were being worked on daily.
 *
 * Two rules fix it:
 *
 *   wider   a Project, Course, Milestone, Assignment, Exam or piece of
 *           content linked to a goal is work on that goal
 *   deeper  so is work linked to *those*. Tasks hang off the project, not
 *           off the goal, and that is where the activity actually happens.
 *
 * Two hops and no further: past that, everything in a connected graph is
 * evidence for everything else.
 */

/** Node types that represent work towards a goal. */
const WORK_TYPES = new Set([
  'Milestone', 'Task', 'Habit', 'Project', 'Course',
  'Assignment', 'Exam', 'ContentPiece', 'ContentSeries',
])

/** Work that holds other work, and so is worth looking inside. */
const CONTAINERS = new Set(['Project', 'Course', 'Milestone', 'ContentSeries'])

/** Edges that record scheduling rather than meaning. */
const IGNORED_EDGES = new Set(['scheduled-for'])

/**
 * Not followed on the second hop.
 *
 * A direct link counts however vague it is — somebody decided to attach that
 * thing to that goal. Reaching one step further is the app's own inference,
 * so it only follows edges that actually mean "this is part of that": two
 * loosely related projects should not lend each other their activity.
 */
const VAGUE_EDGES = new Set(['related-to'])

export interface GoalWork {
  /** Linked to the goal itself. */
  direct: Node[]
  /** Linked to one of those — a project's tasks, a course's assignments. */
  nested: Node[]
  /** Everything, in one list. */
  all: Node[]
  /** Containers that turned out to hold work, by node id. */
  filledContainers: Set<number>
}

function adjacency(edges: Edge[], skip: (type: string) => boolean): Map<number, number[]> {
  const map = new Map<number, number[]>()
  const add = (from: number, to: number) => {
    const list = map.get(from)
    if (list) list.push(to)
    else map.set(from, [to])
  }
  for (const e of edges) {
    if (skip(e.type)) continue
    add(e.sourceId, e.targetId)
    add(e.targetId, e.sourceId)
  }
  return map
}

/**
 * The work attached to each of `containers`, from one read of the graph.
 *
 * Written for goals, and used for projects too: nothing below is specific to
 * a goal beyond refusing to descend into one, which is right either way —
 * two things sharing a project should not inherit each other.
 *
 * Returns a map rather than taking one id because every caller wants all of
 * them, and doing it singly meant a neighbour query each — every one of
 * which read the whole node table anyway.
 */
export function collectWork(containers: Node[], nodes: Node[], edges: Edge[]): Map<number, GoalWork> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const near = adjacency(edges, (t) => IGNORED_EDGES.has(t))
  const inside = adjacency(edges, (t) => IGNORED_EDGES.has(t) || VAGUE_EDGES.has(t))
  const out = new Map<number, GoalWork>()

  for (const goal of containers) {
    const seen = new Set<number>([goal.id])
    const direct: Node[] = []
    for (const id of near.get(goal.id) ?? []) {
      const node = byId.get(id)
      if (!node || seen.has(id) || !WORK_TYPES.has(node.type)) continue
      seen.add(id)
      direct.push(node)
    }

    const nested: Node[] = []
    const filledContainers = new Set<number>()
    for (const container of direct) {
      if (!CONTAINERS.has(container.type)) continue
      for (const id of inside.get(container.id) ?? []) {
        const node = byId.get(id)
        // Goals are skipped on purpose: two goals sharing a project should
        // not each inherit the other as their own work.
        if (!node || seen.has(id) || node.type === 'Goal' || !WORK_TYPES.has(node.type)) continue
        seen.add(id)
        nested.push(node)
        filledContainers.add(container.id)
      }
    }

    out.set(goal.id, { direct, nested, all: [...direct, ...nested], filledContainers })
  }

  return out
}

const day = (iso: string) => iso.slice(0, 10)

/**
 * The most recent sign of life anywhere in a goal's work, as YYYY-MM-DD,
 * or null when there is nothing attached to it at all.
 *
 * A habit is a special case: ticking one off writes a HabitLog and leaves
 * the Habit node itself untouched, so its `updatedAt` says nothing about
 * whether it is being kept.
 */
export function lastActivityFor(work: GoalWork, habitLogs: Node[]): string | null {
  if (work.all.length === 0) return null

  let latest: string | null = null
  const consider = (date: string) => { if (!latest || date > latest) latest = date }

  for (const node of work.all) consider(day(node.updatedAt))

  const habitIds = new Set(work.all.filter((n) => n.type === 'Habit').map((n) => n.id))
  if (habitIds.size > 0) {
    for (const log of habitLogs) {
      const p = log.properties as Record<string, unknown>
      if (typeof p.habitNodeId !== 'number' || !habitIds.has(p.habitNodeId)) continue
      if (typeof p.date === 'string') consider(p.date)
    }
  }

  return latest
}

/**
 * How far along a goal is, counted from the state of its work.
 *
 * Never stored, so it cannot drift from what has actually been done. A
 * container is counted only when nothing was found inside it — otherwise a
 * project would be worth as much as each of its own tasks, and finishing a
 * three-task project would read as 25% rather than 100%.
 */
export function goalProgress(
  work: GoalWork,
  habitLogs: Node[],
  /** A habit counts as kept if it was logged on or after this date. */
  since: string,
): { counted: number; done: number; progress: number | null } {
  const counted = work.all.filter((n) => !work.filledContainers.has(n.id))
  if (counted.length === 0) return { counted: 0, done: 0, progress: null }

  let done = 0
  for (const node of counted) {
    const p = node.properties as Record<string, unknown>
    if (node.type === 'Habit') {
      // A habit is "on track" if it has been kept at least once recently —
      // it is never finished, so completion cannot be the measure.
      const kept = habitLogs.some((l) => {
        const lp = l.properties as Record<string, unknown>
        return lp.habitNodeId === node.id && typeof lp.date === 'string' && lp.date >= since && lp.completed === true
      })
      if (kept) done++
    } else if (p.status === 'done' || p.status === 'completed' || p.stage === 'published') {
      done++
    }
  }

  return { counted: counted.length, done, progress: Math.round((done / counted.length) * 100) }
}
