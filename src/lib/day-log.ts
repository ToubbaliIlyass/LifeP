import { createEdge, createNode, deleteNode, getEdges, getNodeById, getNodes, updateNode } from '@/lib/graph/queries'
import { eventOccursOn, todayStr } from '@/lib/date'
import { toMinutes, fromMinutes, DEFAULT_HABIT_MINUTES, DEFAULT_TASK_MINUTES } from '@/lib/schedule'
import { recordSignal } from '@/lib/availability'
import { setTaskStatus } from '@/lib/tasks'
import { buildSessions, blockOccursOn, batchLabel } from '@/lib/sessions'
import { displayName } from '@/lib/graph/naming'
import type { Node } from '@/lib/db/schema'

/**
 * What actually happened, told rather than clicked.
 *
 * Learning used to see only the part of a day that passed through the
 * calendar UI — a tick, a drag, a delete. "Went to the gym at 7" said in chat
 * taught the scheduler nothing, or became a vague memory with no time in it.
 * This records it as the same kind of evidence a click is, so it feeds the
 * learning that already exists (src/lib/availability.ts) instead of a second
 * system beside it.
 *
 * Silent by design, like memory. The one visible effect is completing the
 * matched task or habit, because that changes what the user sees.
 */

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export interface LogInput {
  /** What was done, in the user's words. */
  what: string
  /** The task or habit it was, when the assistant already knows. Preferred over name matching. */
  nodeId?: number
  /** YYYY-MM-DD; today when omitted. */
  date?: string
  start?: string
  end?: string
  /** True for "this morning", "after lunch" — a guessed time counts for less. */
  approximate?: boolean
  /** Whether it was finished. Defaults to true: "I did X" means X is done. */
  completed?: boolean
}

export interface LogResult {
  logged: boolean
  matched: { id: number; type: string; name: string } | null
  markedDone: boolean
  /** When it had been planned for, if it was on the calendar that day. */
  plannedFor: string | null
  /** Whether the calendar was corrected to match, and how. */
  reflected: 'moved' | 'created' | null
  error?: string
}

/**
 * The task or habit a report is about, or null when it is about neither.
 *
 * By id first — the assistant sees the graph with ids and should pass one.
 * By name only as a fallback, and only when exactly one thing fits: logging
 * against the wrong habit would poison its usual time, which is worse than
 * logging against nothing.
 */
export async function matchItem(userId: number, what: string, nodeId?: number): Promise<Node | null> {
  if (typeof nodeId === 'number') {
    const node = await getNodeById(userId, nodeId)
    return node && (node.type === 'Task' || node.type === 'Habit') ? node : null
  }

  const target = normalise(what)
  if (!target) return null
  const candidates = [
    ...(await getNodes(userId, { type: 'Task' })),
    ...(await getNodes(userId, { type: 'Habit' })),
  ].filter((n) => (n.properties as Record<string, unknown>).archived !== true)

  const named = candidates.map((n) => {
    const name = normalise(displayName(n.type, n.properties as Record<string, unknown>))
    return { n, name, words: significant(name) }
  })
  const exact = named.filter((c) => c.name === target)
  if (exact.length === 1) return exact[0].n
  if (exact.length > 1) return null

  /*
   * By words, not by substring. The way people report doing something rarely
   * repeats the task's own wording: "finished the Silkor website SEO" is the
   * task "Work on Silkor website SEO", and neither string contains the other.
   * So the filler and the verbs are dropped and what is left is compared.
   *
   * First, a task whose every word appears in what was said — the whole name
   * was mentioned, whatever surrounds it. Then the looser reverse, for "did
   * my workout" finding "Morning workout". Each step has to land on exactly
   * one thing: "the SEO" fits two tasks, and guessing between them would
   * teach the wrong one a false time.
   */
  const said = significant(target)
  if (said.size === 0) return null

  const named_in_full = named.filter((c) =>
    c.words.size > 0 &&
    [...c.words].every((w) => said.has(w)) &&
    // A name that comes down to one short word is not enough to go on:
    // "Make Bed" is just "bed", and "went to bed at 11" would tick it off.
    (c.words.size > 1 || [...c.words][0].length >= 4))
  if (named_in_full.length === 1) return named_in_full[0].n
  if (named_in_full.length > 1) return null

  const mentioned = named.filter((c) =>
    [...said].every((w) => c.words.has(w)) &&
    // One short word ("gym", "seo") is too little to pin a task to.
    [...said].some((w) => w.length >= 4))
  return mentioned.length === 1 ? mentioned[0].n : null
}

/**
 * Words that carry no identity: articles, prepositions, and the verbs people
 * wrap around what they did. "Work" is here because it is how tasks get
 * named ("Work on X") and how doing them gets described ("worked on X"), so
 * it matches everything and tells nothing apart.
 */
const FILLER = new Set([
  'a', 'an', 'the', 'my', 'some', 'of', 'on', 'in', 'at', 'to', 'for', 'with', 'and', 'about', 'around', 'bit', 'little',
  'i', 'me', 'we', 'this', 'that', 'it',
  'did', 'do', 'done', 'doing', 'went', 'go', 'going', 'got', 'had', 'have', 'made', 'make',
  'finished', 'finish', 'completed', 'complete', 'started', 'start',
  'work', 'worked', 'working', 'spent', 'hour', 'hours', 'minutes', 'mins',
])

function significant(text: string): Set<string> {
  return new Set(text.split(' ').filter((w) => w && !FILLER.has(w)).map(stem))
}

/**
 * Just enough to make past tense meet the task's own wording. A day log is
 * written in the past — "filmed the intro video", "brushed my teeth" — while
 * the things it refers to are named in the imperative, "Film team intro
 * video". Without this almost every natural report missed.
 *
 * Deliberately crude, and deliberately cautious: each rule needs a stem of
 * at least three letters left, so "need", "bed" and "red" are not mangled.
 */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ied')) return word.slice(0, -3) + 'y'   // studied → study
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)         // reading → read
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)          // filmed → film
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1) // videos → video
  return word
}

/** Minute the item was planned for on that date, from any block holding it. */
async function plannedMinute(userId: number, itemId: number, date: string): Promise<number | null> {
  const edges = await getEdges(userId, { targetId: itemId, type: 'scheduled-for' })
  if (edges.length === 0) return null
  const blocks = await getNodes(userId, { type: 'TimeBlock' })
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const sessions = buildSessions({
    blocks: edges.map((e) => byId.get(e.sourceId)).filter((b): b is Node => !!b),
    edges,
    byId: new Map(),
    habitLogs: [],
    date,
  })
  return sessions.length ? toMinutes(sessions[0].startTime) : null
}

/**
 * Puts what was reported onto the calendar, where the user can see it.
 *
 * Saying "I did my workout at 14:00" used to change the log and the learning
 * and nothing else: the calendar still showed the workout at whatever time it
 * had been planned for, so the day on screen disagreed with the day that
 * happened. A record of a day is only worth having if it is the one the user
 * looks at.
 *
 * Whatever this writes is a record, not a plan, so it is always 'hard' —
 * planning again must never move or clear something that already happened.
 *
 * A routine is left alone. It is one block occurring on many days, and moving
 * it to fit one afternoon would drag every other occurrence with it.
 */
async function reflectOnCalendar(
  userId: number,
  item: Node,
  date: string,
  start: number,
  end: number | null,
): Promise<'moved' | 'created' | null> {
  const p = item.properties as Record<string, unknown>
  const stated =
    typeof p.durationMinutes === 'number' && p.durationMinutes > 0 ? p.durationMinutes
      : typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0 ? p.estimatedMinutes
      : item.type === 'Habit' ? DEFAULT_HABIT_MINUTES
      : DEFAULT_TASK_MINUTES
  const finish = Math.min(24 * 60 - 1, end ?? start + stated)

  const times = { startTime: fromMinutes(start), endTime: fromMinutes(finish), happened: true, firmness: 'hard' }

  const edges = await getEdges(userId, { targetId: item.id, type: 'scheduled-for' })
  const blocks = await getNodes(userId, { type: 'TimeBlock' })
  const byId = new Map(blocks.map((b) => [b.id, b]))
  for (const edge of edges) {
    const block = byId.get(edge.sourceId)
    if (!block || !blockOccursOn(block, date)) continue
    const bp = block.properties as Record<string, unknown>
    if (typeof bp.frequency === 'string' && bp.frequency !== 'once') continue
    // A block holding several things is a session the user arranged; moving
    // it because one of its contents happened elsewhere would move the rest.
    const inBlock = await getEdges(userId, { sourceId: block.id, type: 'scheduled-for' })
    if (inBlock.length > 1) continue
    await updateNode(userId, block.id, { ...bp, ...times })
    return 'moved'
  }

  const block = await createNode(userId, 'TimeBlock', { date, ...times })
  await createEdge(userId, block.id, item.id, 'scheduled-for', {})
  return 'created'
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export async function logActivity(userId: number, input: LogInput): Promise<LogResult> {
  const what = input.what.trim()
  if (!what) return { logged: false, matched: null, markedDone: false, plannedFor: null, reflected: null, error: 'Say what was done.' }

  const date = input.date && DATE.test(input.date) ? input.date : todayStr()
  const start = input.start && TIME.test(input.start) ? toMinutes(input.start) : null
  const end = input.end && TIME.test(input.end) ? toMinutes(input.end) : null
  if (start !== null && end !== null && end <= start) {
    return { logged: false, matched: null, markedDone: false, plannedFor: null, reflected: null, error: 'end must be after start' }
  }

  const item = await matchItem(userId, what, input.nodeId)
  const completed = input.completed !== false
  let markedDone = false

  if (item && completed) {
    if (item.type === 'Task') {
      const p = item.properties as Record<string, unknown>
      if (p.status !== 'done') {
        await setTaskStatus(userId, item.id, 'done')
        markedDone = true
      }
    } else if (item.type === 'Habit') {
      const logs = await getNodes(userId, { type: 'HabitLog' })
      const existing = logs.find((l) => {
        const lp = l.properties as Record<string, unknown>
        return lp.habitNodeId === item.id && lp.date === date
      })
      if (!existing) {
        await createNode(userId, 'HabitLog', { habitNodeId: item.id, date, completed: true })
        markedDone = true
      } else if ((existing.properties as Record<string, unknown>).completed !== true) {
        await updateNode(userId, existing.id, { ...(existing.properties as Record<string, unknown>), completed: true })
        markedDone = true
      }
    }
  }

  const planned = item ? await plannedMinute(userId, item.id, date) : null

  /*
   * Read the planned time *before* this, and reflect after: the calendar is
   * about to be corrected to where the thing really happened, and the gap
   * between the two is exactly what the learning wants to know about.
   */
  const reflected =
    item && start !== null ? await reflectOnCalendar(userId, item, date, start, end) : null
  const name = item ? displayName(item.type, item.properties as Record<string, unknown>) : what

  await recordSignal(userId, {
    kind: 'reported',
    itemType: item?.type ?? 'Activity',
    // 0 is "matched nothing": still evidence of when the day has room, and
    // collected by name so a repeated activity can be offered as a habit.
    itemId: item?.id ?? 0,
    name,
    date,
    minute: start,
    endMinute: end,
    approximate: input.approximate === true,
    plannedMinute: planned,
  })

  return {
    logged: true,
    matched: item ? { id: item.id, type: item.type, name } : null,
    markedDone,
    plannedFor: planned !== null ? fromMinutes(planned) : null,
    reflected,
  }
}

export interface DayLogEntry {
  id: number
  source: 'reported' | 'done' | 'moved' | 'skipped' | 'batched'
  name: string
  itemType: string
  start: string | null
  end: string | null
  approximate: boolean
  /** Set when it happened away from where it was planned. */
  plannedFor: string | null
}

export interface DayLog {
  date: string
  planned: { kind: 'block' | 'event'; name: string; start: string; end: string }[]
  happened: DayLogEntry[]
}

/**
 * One day, planned against what happened. The planned side is the calendar
 * as it stands; the happened side is every signal recorded for the date,
 * clicked or told.
 */
export async function readDayLog(userId: number, date: string): Promise<DayLog> {
  const nodes = await getNodes(userId)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = await getEdges(userId, { type: 'scheduled-for' })

  const planned: DayLog['planned'] = []
  for (const s of buildSessions({
    blocks: nodes.filter((n) => n.type === 'TimeBlock'),
    edges,
    byId,
    habitLogs: nodes.filter((n) => n.type === 'HabitLog'),
    date,
  })) {
    planned.push({
      kind: 'block',
      name: s.label ?? (s.tasks.length === 1 ? s.tasks[0].name : s.tasks.length ? batchLabel(s.tasks) : 'Time block'),
      start: s.startTime,
      end: s.endTime,
    })
  }
  for (const e of nodes.filter((n) => n.type === 'Event')) {
    const p = e.properties as Record<string, unknown>
    if (typeof p.time !== 'string') continue
    const occurs = eventOccursOn({
      date: typeof p.date === 'string' ? p.date : null,
      frequency: typeof p.frequency === 'string' ? p.frequency : null,
      daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
      until: typeof p.until === 'string' ? p.until : null,
    }, date)
    if (!occurs) continue
    planned.push({
      kind: 'event',
      name: displayName('Event', p),
      start: p.time,
      end: fromMinutes(toMinutes(p.time) + (typeof p.duration === 'number' ? p.duration : 60)),
    })
  }
  planned.sort((a, b) => a.start.localeCompare(b.start))

  const happened: DayLogEntry[] = nodes
    .filter((n) => n.type === 'ActivitySignal' && (n.properties as Record<string, unknown>).date === date)
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      const minute = typeof p.minute === 'number' ? p.minute : null
      const endMinute = typeof p.endMinute === 'number' ? p.endMinute : null
      const plannedAt = typeof p.plannedMinute === 'number' ? p.plannedMinute : null
      return {
        id: n.id,
        source: (typeof p.kind === 'string' ? p.kind : 'done') as DayLogEntry['source'],
        name: typeof p.name === 'string' ? p.name : 'Something',
        itemType: typeof p.itemType === 'string' ? p.itemType : 'Activity',
        start: minute !== null ? fromMinutes(minute) : null,
        end: endMinute !== null ? fromMinutes(endMinute) : null,
        approximate: p.approximate === true,
        plannedFor: plannedAt !== null && minute !== null && Math.abs(plannedAt - minute) >= 30 ? fromMinutes(plannedAt) : null,
      }
    })
    // In time order, untimed last; within the same minute what the user said
    // comes before the click that recorded the same thing.
    .sort((a, b) =>
      (a.start ?? '99:99').localeCompare(b.start ?? '99:99') ||
      Number(b.source === 'reported') - Number(a.source === 'reported'))

  return { date, planned, happened }
}

/**
 * Removes one entry. Only reported entries: a click's signal is a record of
 * something the user did in the app, and deleting it would just make the
 * learning forget a fact. A report can be wrong — a misheard time — and the
 * user has to be able to take it back.
 */
export async function deleteLogEntry(userId: number, id: number): Promise<boolean> {
  const node = await getNodeById(userId, id)
  if (!node || node.type !== 'ActivitySignal') return false
  if ((node.properties as Record<string, unknown>).kind !== 'reported') return false
  await deleteNode(userId, id)
  return true
}
