import { displayName } from '@/lib/graph/naming'
import { eventOccursOn } from '@/lib/date'
import type { Edge, Node } from '@/lib/db/schema'

/**
 * A time block holding more than one thing.
 *
 * "Study" is two hours in which several assignments get done; a CLE shift is
 * an afternoon covering whatever that job needs. The calendar could not say
 * that. A block was one task, so batching meant booking three blocks over the
 * same two hours — which read as a triple booking, was drawn as three bars,
 * and had the day counted as three times busier than it was.
 *
 * Nothing new is stored for this. A TimeBlock already links to what it is for
 * with a `scheduled-for` edge; it simply may now have several, and an
 * optional `label` for what the session itself is called. Every reader used
 * to take the first edge and drop the rest — `new Map(edges.map(...))` keeps
 * only the last — so the change is in the reading, not the schema.
 */

/**
 * How much a block means it.
 *
 * 'hard' is a commitment: an appointment, a class, a shift, anything the user
 * put somewhere on purpose. Nothing may move or clear it.
 *
 * 'tentative' is where the plan currently puts something — a habit or a task
 * laid into the day's gaps. Planning again is free to pick a different time,
 * because no promise was ever made about this one. That distinction is what
 * lets the calendar hold a plan without the plan pretending to be a diary.
 */
export type Firmness = 'hard' | 'tentative'

/**
 * Blocks written before firmness existed carry `autoScheduled` instead, which
 * meant the same thing — the scheduler put it there, nobody agreed to it.
 */
export function firmnessOf(props: Record<string, unknown>): Firmness {
  if (props.firmness === 'tentative' || props.firmness === 'hard') return props.firmness
  return props.autoScheduled === true ? 'tentative' : 'hard'
}

export interface SessionTask {
  id: number
  type: string
  name: string
  done: boolean
}

export interface Session {
  id: number
  /** The day this occurrence falls on, which for a routine is not its own date. */
  date: string
  startTime: string
  endTime: string
  /** What the session is called, when it is more than the one task in it. */
  label: string | null
  /** Everything being worked on in this block, in the order it was added. */
  tasks: SessionTask[]
  /** True when the block was placed by the scheduler rather than by hand. */
  autoScheduled: boolean
  /** Whether this is a commitment or just where the plan currently puts it. */
  firmness: Firmness
  /** 'once' for an ordinary block; anything else is a routine. */
  frequency: string
  /** Set on every occurrence of a routine, so one cannot be dragged alone. */
  recurring: boolean
}

/**
 * Whether a block falls on a date.
 *
 * A block used to be one day, so every reader compared `properties.date` to
 * the day it was drawing. A routine — a morning block with the same habits in
 * it every day — is one block with many occurrences, described by the same
 * frequency/daysOfWeek/until that Events and Habits already use. Asking here
 * rather than comparing dates is what lets one definition appear all week.
 */
export function blockOccursOn(block: Node, date: string): boolean {
  const p = block.properties as Record<string, unknown>
  return eventOccursOn(
    {
      date: typeof p.date === 'string' ? p.date : null,
      frequency: typeof p.frequency === 'string' ? p.frequency : 'once',
      daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
      until: typeof p.until === 'string' ? p.until : null,
    },
    date,
  )
}

/** Whether a node counts as finished, by whichever field its type uses. */
export function isDone(node: Node, habitLogs: Node[], date: string): boolean {
  const p = node.properties as Record<string, unknown>
  if (node.type === 'Habit') {
    // A habit has no status — completion lives in a HabitLog for the day.
    return habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === node.id && lp.date === date && lp.completed === true
    })
  }
  return p.status === 'done'
}

/** Every `scheduled-for` target of a block, not just the first one found. */
export function tasksByBlock(edges: Edge[]): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (const e of edges) {
    if (e.type !== 'scheduled-for') continue
    const list = map.get(e.sourceId)
    if (list) list.push(e.targetId)
    else map.set(e.sourceId, [e.targetId])
  }
  return map
}

/**
 * Turns TimeBlock nodes into sessions, each carrying everything in it.
 *
 * `byId` is the whole node table indexed once: a block's tasks would
 * otherwise be a query each, and a week of them a few hundred round trips.
 */
export function buildSessions({
  blocks, edges, byId, habitLogs, date,
}: {
  blocks: Node[]
  edges: Edge[]
  byId: Map<number, Node>
  habitLogs: Node[]
  /**
   * The day being drawn. Passed in rather than read off the block: a routine
   * occurs on many days, and what is done in it is per-day.
   */
  date: string
}): Session[] {
  const targets = tasksByBlock(edges)

  return blocks
    .filter((block) => blockOccursOn(block, date))
    .map((block) => {
      const p = block.properties as Record<string, unknown>
      const tasks: SessionTask[] = (targets.get(block.id) ?? [])
        .map((id) => byId.get(id))
        .filter((n): n is Node => !!n)
        .map((n) => ({
          id: n.id,
          type: n.type,
          name: displayName(n.type, n.properties as Record<string, unknown>),
          done: isDone(n, habitLogs, date),
        }))

      const frequency = typeof p.frequency === 'string' ? p.frequency : 'once'
      return {
        id: block.id,
        date,
        startTime: typeof p.startTime === 'string' ? p.startTime : '00:00',
        endTime: typeof p.endTime === 'string' ? p.endTime : '01:00',
        label: typeof p.label === 'string' && p.label.trim() ? p.label.trim() : null,
        tasks,
        autoScheduled: p.autoScheduled === true,
        firmness: firmnessOf(p),
        frequency,
        recurring: frequency !== 'once' && frequency !== 'none',
      }
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/**
 * What a batch of things is called when it has no name of its own.
 *
 * Not "3 tasks". A morning block of habits is not three tasks, and calling it
 * that miscounts the day's workload in the one place the user reads it — the
 * calendar said "3 tasks" over Brush Teeth, Make Bed and Weigh Myself. The
 * label follows what is actually in it, and only falls back to the vaguer
 * word when the block holds a mixture.
 */
export function batchLabel(tasks: { type: string }[]): string {
  const kinds = new Set(tasks.map((t) => t.type))
  const word =
    kinds.size === 1
      ? { Habit: 'habits', Task: 'tasks', Assignment: 'assignments', Exam: 'exams' }[[...kinds][0]] ?? 'things'
      : 'things'
  return `${tasks.length} ${word}`
}

/**
 * What to call a session on a calendar or a timeline.
 *
 * Its own label if it has one; otherwise the single thing in it, which is the
 * common case and reads better than a name repeated above itself. Several
 * things with no label is a batch nobody has named yet, so it says so.
 */
export function sessionTitle(session: Session): string {
  if (session.label) return session.label
  if (session.tasks.length === 1) return session.tasks[0].name
  if (session.tasks.length > 1) return batchLabel(session.tasks)
  return 'Time block'
}

/** The colour class the calendar draws it in. */
export function sessionKind(session: Session): string {
  if (session.label || session.tasks.length > 1) return 'session'
  return (session.tasks[0]?.type ?? 'block').toLowerCase()
}
