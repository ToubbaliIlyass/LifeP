import type { Node, Edge } from '@/lib/db/schema'
import { addDays, eventOccursOn, isDueOn } from '@/lib/date'
import { blockOccursOn, firmnessOf } from '@/lib/sessions'
import { displayName } from '@/lib/graph/naming'
import { toMinutes } from '@/lib/schedule'
import type { PrayerSlot } from '@/lib/now'

/**
 * Everything is something to be done.
 *
 * The graph holds Tasks, Habits, Projects, Goals, Events and the day's five
 * prayers, each with its own fields and its own idea of "done". The screen
 * holds one thing: a list of to-dos, sorted into Inbox, Today, Upcoming,
 * Anytime and Someday, some of them inside a project. This file is the one
 * place that translates between the two, so no list has to know what kind of
 * node a row came from.
 *
 *   Task     a to-do. `dueDate` is the day it is *for* (the planner has always
 *            read it that way), `deadline` is the day it must be done by.
 *   Habit    a to-do that comes back: on Today each day it is due, ticked off
 *            into a HabitLog.
 *   Prayer   one of the five, at its time, when prayers are switched on.
 *   Project  a list of to-dos that can be finished. Goal: an area holding
 *            projects and to-dos, which never is.
 *   Event    not a to-do: it happens whether or not anything is ticked, so it
 *            is shown beside the day's list rather than in it.
 */

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Todo {
  /** The node's id. Prayers have no node of their own and are -1 … -5. */
  id: number
  type: 'Task' | 'Habit' | 'Prayer'
  title: string
  notes: string
  /** The day it is for, YYYY-MM-DD. A habit's is today on the days it is due. */
  when: string | null
  evening: boolean
  someday: boolean
  deadline: string | null
  /** HH:MM on its own day, when it has a place on the clock. */
  time: string | null
  /** True when the planner chose that time and nobody has confirmed it. */
  timePlanned: boolean
  /** How long it takes, in minutes, when known. */
  minutes: number | null
  tags: string[]
  checklist: ChecklistItem[]
  /** The project or area it sits in. */
  listId: number | null
  /** The heading it sits under, inside a project. */
  headingId: string | null
  done: boolean
  /** ISO timestamp. */
  doneAt: string | null
  order: number
  /** "daily", "weekdays", "weekly" — for anything that comes back. */
  repeats: string | null
  /** The weekdays it comes back on, 0=Sun; null for every day. So Upcoming can show what is coming round. */
  repeatDays: number[] | null
  /** HH:MM on its day, to be reminded at. */
  reminder: string | null
  /** Minutes before its time on its day — "10 minutes before". See src/lib/reminders.ts. */
  remindBefore?: number | null
  /** A moment on any day, YYYY-MM-DDTHH:MM in the user's zone. */
  remindAt?: string | null
  /** Snoozed: reminds again at this moment, YYYY-MM-DDTHH:MM. */
  snoozedUntil?: string | null
  /** Marked as mattering more — or less — than the rest. */
  priority: 'high' | 'low' | null
  /** Days in a row, for habits. */
  streak: number | null
  prayerKey?: string
  /** On a draft only: becomes an Event (something you show up to) when saved, not a to-do. */
  asEvent?: boolean
  /** On a draft event: where. */
  location?: string
  /** On a draft: the day and time typed into its title are kept as words, not read. */
  literal?: boolean
}

/** A named stretch of a project: "Preparation", "Facilities". Holds to-dos, means nothing on its own. */
export interface Heading {
  id: string
  title: string
  /** A few lines under the heading, when it has some. */
  note?: string
}

export interface TodoList {
  id: number
  kind: 'area' | 'project'
  title: string
  notes: string
  /** A project's headings, in order. Kept on the project, so one can be empty, renamed or reordered. */
  headings: Heading[]
  /** The area a project belongs to. */
  areaId: number | null
  deadline: string | null
  done: boolean
  doneAt: string | null
  order: number
}

export interface DayEvent {
  id: number
  date: string
  title: string
  time: string | null
  endTime: string | null
  location: string | null
  /** How long, in minutes. */
  minutes: number
  /** 'once' | 'daily' | 'weekdays' | 'weekly'. */
  frequency: string
  daysOfWeek: number[] | null
  /** The day it was first on — what an edit changes, for a repeating one. */
  firstDate: string | null
  /** The last day a repeating one is on. */
  until?: string | null
  /** HH:MM on each day it is on, to be reminded at. */
  reminder?: string | null
  /** Minutes before it starts. */
  remindBefore?: number | null
  /** Snoozed: reminds again at this moment. */
  snoozedUntil?: string | null
}

export interface TodosPayload {
  date: string
  todos: Todo[]
  lists: TodoList[]
  events: DayEvent[]
}

/** Finished to-dos kept for the Logbook; older ones stay in the database. */
const LOGBOOK_LIMIT = 300
/** How far ahead Upcoming lists each day by name. */
export const UPCOMING_DAYS = 7

const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
const props = (n: Node) => n.properties as Record<string, unknown>

const HHMM = /^\d{2}:\d{2}$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
/** The reminder fields a node may carry, each read only if well formed. See src/lib/reminders.ts. */
export function reminderFields(p: Record<string, unknown>) {
  return {
    reminder: HHMM.test(String(p.reminder ?? '')) ? String(p.reminder) : null,
    remindBefore: typeof p.remindBefore === 'number' && p.remindBefore > 0 && p.remindBefore <= 7 * 24 * 60 ? Math.round(p.remindBefore) : null,
    remindAt: MOMENT.test(String(p.remindAt ?? '')) ? String(p.remindAt) : null,
    snoozedUntil: MOMENT.test(String(p.snoozedUntil ?? '')) ? String(p.snoozedUntil) : null,
  }
}

function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

function checklistOf(v: unknown): ChecklistItem[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((c, i) => {
    if (!c || typeof c !== 'object') return []
    const item = c as Record<string, unknown>
    if (typeof item.text !== 'string') return []
    return [{ id: typeof item.id === 'string' ? item.id : `c${i}`, text: item.text, done: item.done === true }]
  })
}

function headingsOf(v: unknown): Heading[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((h) => {
    const item = (h ?? {}) as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.title !== 'string') return []
    return [{ id: item.id, title: item.title, ...(typeof item.note === 'string' ? { note: item.note } : {}) }]
  })
}

/** The weekdays a rule comes back on, in the same terms as isDueOn (src/lib/date.ts). */
function daysFor(frequency: unknown, daysOfWeek: unknown): number[] | null {
  const days = Array.isArray(daysOfWeek) ? daysOfWeek.filter((d): d is number => typeof d === 'number') : []
  if (frequency === 'weekdays') return days.length ? days : [1, 2, 3, 4, 5]
  if (frequency === 'weekly') return days
  return null
}

const tagsOf = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [])

/** The list a node sits in: a project if it is linked to one, else an area. */
function containerOf(nodeId: number, edges: Edge[], kindById: Map<number, 'area' | 'project'>): number | null {
  let area: number | null = null
  for (const e of edges) {
    if (e.type === 'scheduled-for') continue
    const other = e.sourceId === nodeId ? e.targetId : e.targetId === nodeId ? e.sourceId : null
    if (other === null) continue
    const kind = kindById.get(other)
    if (kind === 'project') return other
    if (kind === 'area' && area === null) area = other
  }
  return area
}

export function buildTodos({
  date,
  nodes,
  edges,
  prayers,
  prayerHabitId = null,
}: {
  /** The user's today — see src/lib/clock.ts. */
  date: string
  nodes: Node[]
  edges: Edge[]
  /** Today's five, when the feature is on and a location is known. */
  prayers?: PrayerSlot[]
  /** The habit those five tick off, hidden while they are shown instead. */
  prayerHabitId?: number | null
}): TodosPayload {
  const dow = new Date(date + 'T00:00:00').getDay()

  const kindById = new Map<number, 'area' | 'project'>()
  for (const n of nodes) {
    if (n.type === 'Goal') kindById.set(n.id, 'area')
    else if (n.type === 'Project') kindById.set(n.id, 'project')
  }

  const lists: TodoList[] = nodes
    .filter((n) => kindById.has(n.id))
    .map((n) => {
      const p = props(n)
      const kind = kindById.get(n.id)!
      const done = p.status === 'completed' || p.status === 'done'
      let areaId: number | null = null
      if (kind === 'project') {
        for (const e of edges) {
          const other = e.sourceId === n.id ? e.targetId : e.targetId === n.id ? e.sourceId : null
          if (other !== null && kindById.get(other) === 'area') { areaId = other; break }
        }
      }
      return {
        id: n.id,
        kind,
        title: displayName(n.type, p),
        notes: str(p.description) ?? '',
        headings: kind === 'project' ? headingsOf(p.headings) : [],
        areaId,
        deadline: str(kind === 'area' ? p.targetDate : p.dueDate),
        done,
        doneAt: done ? str(p.completedAt) ?? n.updatedAt : null,
        order: typeof p.order === 'number' ? p.order : n.id,
      }
    })

  // Where each thing sits on the clock of its own day, from the blocks for it.
  const blockById = new Map(nodes.filter((n) => n.type === 'TimeBlock').map((b) => [b.id, b]))
  const blocksOf = new Map<number, Node[]>()
  for (const e of edges) {
    if (e.type !== 'scheduled-for') continue
    const block = blockById.get(e.sourceId)
    if (block) blocksOf.set(e.targetId, [...(blocksOf.get(e.targetId) ?? []), block])
  }
  const clockOn = (id: number, day: string | null): { time: string | null; planned: boolean } => {
    let best: Node | null = null
    for (const b of day ? blocksOf.get(id) ?? [] : []) {
      if (!blockOccursOn(b, day!)) continue
      if (!best || String(props(b).startTime) < String(props(best).startTime)) best = b
    }
    const time = best ? str(props(best).startTime) : null
    return { time, planned: !!best && firmnessOf(props(best)) === 'tentative' }
  }

  const logs = nodes.filter((n) => n.type === 'HabitLog').map(props)
  const showingPrayers = !!prayers?.length
  const todos: Todo[] = []

  for (const n of nodes) {
    const p = props(n)
    if (n.type === 'Task') {
      const done = p.status === 'done'
      const recurrence = p.recurrence as { frequency?: unknown } | undefined
      const clock = done || p.someday === true ? { time: null, planned: false } : clockOn(n.id, str(p.dueDate))
      todos.push({
        id: n.id,
        type: 'Task',
        title: str(p.name) ?? str(p.title) ?? '',
        notes: str(p.notes) ?? '',
        when: p.someday === true ? null : str(p.dueDate),
        evening: p.evening === true,
        someday: p.someday === true,
        deadline: str(p.deadline),
        time: clock.time,
        timePlanned: clock.planned,
        minutes: typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0 ? p.estimatedMinutes : null,
        tags: tagsOf(p.tags),
        checklist: checklistOf(p.checklist),
        listId: containerOf(n.id, edges, kindById),
        headingId: str(p.headingId),
        done,
        doneAt: done ? str(p.completedAt) ?? n.updatedAt : null,
        order: typeof p.order === 'number' ? p.order : n.id,
        repeats: typeof recurrence?.frequency === 'string' ? recurrence.frequency : null,
        repeatDays: daysFor(recurrence?.frequency, (recurrence as { daysOfWeek?: unknown } | undefined)?.daysOfWeek),
        ...reminderFields(p),
        priority: p.priority === 'high' || p.priority === 'low' ? p.priority : null,
        streak: null,
      })
    } else if (n.type === 'Habit') {
      // The prayer habit is on the day as five timed to-dos instead.
      if (showingPrayers && n.id === prayerHabitId) continue
      const frequency = str(p.frequency) ?? 'daily'
      const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
      const kept = new Set(logs.filter((l) => l.habitNodeId === n.id && l.completed === true).map((l) => String(l.date)))
      const done = kept.has(date)
      // Counted back from today when it is done, from yesterday when it is
      // not yet — a streak is not broken by a morning.
      let streak = 0
      for (let d = done ? date : addDays(date, -1); kept.has(d) && streak < 366; d = addDays(d, -1)) streak++
      todos.push({
        id: n.id,
        type: 'Habit',
        title: str(p.name) ?? str(p.title) ?? '',
        notes: str(p.notes) ?? '',
        when: isDueOn(frequency, daysOfWeek, dow) ? date : null,
        evening: p.evening === true,
        someday: false,
        deadline: null,
        time: done ? null : clockOn(n.id, date).time,
        timePlanned: !done && clockOn(n.id, date).planned,
        minutes: typeof p.durationMinutes === 'number' ? p.durationMinutes : null,
        tags: tagsOf(p.tags),
        checklist: [],
        listId: containerOf(n.id, edges, kindById),
        headingId: null,
        done,
        doneAt: null,
        order: typeof p.order === 'number' ? p.order : n.id,
        repeats: frequency,
        repeatDays: daysFor(frequency, daysOfWeek),
        ...reminderFields(p),
        priority: null,
        streak,
      })
    }
  }

  for (const prayer of prayers ?? []) {
    todos.push({
      id: -(PRAYER_ORDER.indexOf(prayer.key) + 1),
      type: 'Prayer',
      title: prayer.label,
      notes: '',
      when: date,
      evening: false,
      someday: false,
      deadline: null,
      time: prayer.time,
      timePlanned: false,
      minutes: null,
      tags: [],
      checklist: [],
      listId: null,
      headingId: null,
      done: prayer.done,
      doneAt: null,
      order: 0,
      repeats: 'daily',
      repeatDays: null,
      reminder: null,
      priority: null,
      streak: null,
      prayerKey: prayer.key,
    })
  }

  // The Logbook's tail is cut; everything still open is always sent.
  const finished = todos.filter((t) => t.type === 'Task' && t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const dropped = new Set(finished.slice(LOGBOOK_LIMIT).map((t) => t.id))

  // Events: each day of the coming week by its occurrences, then one-offs
  // further out. A weekly class is not listed for every week of the year.
  const events: DayEvent[] = []
  const eventNodes = nodes.filter((n) => n.type === 'Event')
  const row = (n: Node, day: string): DayEvent => {
    const p = props(n)
    const time = str(p.time)
    const minutes = typeof p.duration === 'number' ? p.duration : 60
    return {
      id: n.id,
      date: day,
      title: displayName('Event', p),
      time,
      endTime: time ? minutesToTime(toMinutes(time) + minutes) : null,
      location: str(p.location),
      minutes,
      frequency: str(p.frequency) === 'none' ? 'once' : str(p.frequency) ?? 'once',
      daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
      firstDate: str(p.date),
      until: str(p.until),
      reminder: reminderFields(p).reminder,
      remindBefore: reminderFields(p).remindBefore,
      snoozedUntil: reminderFields(p).snoozedUntil,
    }
  }
  for (let i = 0; i <= UPCOMING_DAYS; i++) {
    const day = addDays(date, i)
    for (const n of eventNodes) {
      const p = props(n)
      const occurs = eventOccursOn({
        date: str(p.date),
        frequency: str(p.frequency),
        daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
        until: str(p.until),
      }, day)
      if (occurs) events.push(row(n, day))
    }
  }
  const horizon = addDays(date, UPCOMING_DAYS)
  for (const n of eventNodes) {
    const p = props(n)
    const frequency = str(p.frequency) ?? 'once'
    const day = str(p.date)
    if (day && day > horizon && (frequency === 'once' || frequency === 'none')) events.push(row(n, day))
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))

  return { date, todos: todos.filter((t) => !dropped.has(t.id)), lists, events }
}

