import { isDueOn, eventOccursOn } from '@/lib/date'
import { blockOccursOn } from '@/lib/sessions'
import { toMinutes, DEFAULT_TASK_MINUTES } from '@/lib/schedule'
import type { Node, Edge } from '@/lib/db/schema'

/** One of the five, already placed on the clock. See src/lib/prayer-times.ts. */
export interface PrayerSlot {
  key: string
  label: string
  /** HH:MM local. */
  time: string
  done: boolean
}

export interface NowItem {
  id: number
  kind: 'block' | 'event' | 'habit' | 'task' | 'prayer' | 'due'
  label: string
  /** HH:MM, or null for things with no appointed time. */
  startTime: string | null
  endTime: string | null
  minutes: number | null
  /** The node to act on — a block's underlying task/habit, not the block. */
  targetId: number | null
  targetType: string | null
  note: string | null
  /** Set only on prayers — which of the five, for ticking it off. */
  prayerKey?: string
  /**
   * Everything being worked on inside this block, when it holds a batch.
   * "Study" is the two hours; these are the assignments done in them. The
   * block is one entry on the timeline however many it contains — listing
   * each separately is what made one afternoon read as five commitments.
   */
  children?: { id: number; type: string; name: string; done: boolean }[]
  /**
   * Set on a batch whose contents are all done. It stays on the timeline
   * rather than leaving it: you watched each item strike through inside it,
   * and having the whole session vanish on the last tick read as the app
   * losing what you had just finished.
   */
  completed?: boolean
}

import { PRAYER_MINUTES } from '@/lib/prayers'
/** Only so each slot has a stable id within its kind. */
const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']

function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/**
 * Merges everything happening today into one ordered sequence.
 *
 * Pure, so the merge rules can be exercised directly — the important one
 * being that something already on the calendar appears once, as a timed
 * block, and never again in the untimed list.
 */
export function buildNowQueue({
  date,
  tasks,
  habits,
  habitLogs,
  events,
  timeBlocks,
  scheduledEdges,
  dueItems = [],
  prayers,
  prayerHabitId,
}: {
  date: string
  tasks: Node[]
  habits: Node[]
  habitLogs: Node[]
  events: Node[]
  timeBlocks: Node[]
  scheduledEdges: Edge[]
  /**
   * Anything from an enabled module with a date of its own — an Assignment
   * due, an Exam sat, a ContentPiece going out. A day is not only tasks and
   * habits, and these used to appear nowhere on it: the one screen the user
   * actually lives in stayed silent about the exam tomorrow morning, because
   * Today only ever knew four node types.
   *
   * The caller decides what belongs here, which is how module gating stays
   * in one place (src/lib/modules.ts) instead of being re-decided in here.
   */
  dueItems?: Node[]
  /** Today's five, when the feature is on and a location is known. */
  prayers?: PrayerSlot[]
  /**
   * The Habit those five tick off. Excluded from the queue in its own right
   * while they are shown — otherwise the day lists the same commitment twice,
   * once as five timed slots and once as an untimed habit.
   */
  prayerHabitId?: number | null
}): NowItem[] {
  const dow = new Date(date + 'T00:00:00').getDay()
  const nodeById = new Map([...tasks, ...habits].map((n) => [n.id, n]))

  const habitDoneToday = (habitId: number) =>
    habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === habitId && lp.date === date && lp.completed === true
    })

  const describe = (id: number) => {
    const n = nodeById.get(id)
    if (!n) return null
    const p = n.properties as Record<string, unknown>
    return {
      label: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${n.type} #${n.id}`,
      type: n.type,
      // A habit has no status — its completion lives in a HabitLog. Reading
      // `status` for both is why ticking a habit off the queue used to leave
      // it sitting there: the check could never be true for a habit, and
      // habits reach this queue as calendar blocks because they are
      // auto-filled onto the day.
      done: n.type === 'Habit' ? habitDoneToday(n.id) : p.status === 'done',
    }
  }

  const items: NowItem[] = []
  const scheduledTargets = new Set<number>()
  const showingPrayers = !!prayers?.length
  const hiddenHabitId = showingPrayers ? prayerHabitId ?? null : null

  for (const prayer of prayers ?? []) {
    if (prayer.done) continue
    items.push({
      id: PRAYER_ORDER.indexOf(prayer.key),
      kind: 'prayer',
      label: prayer.label,
      startTime: prayer.time,
      endTime: minutesToTime(toMinutes(prayer.time) + PRAYER_MINUTES),
      minutes: PRAYER_MINUTES,
      targetId: null,
      targetType: null,
      note: null,
      prayerKey: prayer.key,
    })
  }

  // Asked, not compared: a routine block recurs and has one date of its own.
  const blocksToday = timeBlocks.filter((b) => blockOccursOn(b, date))
  for (const block of blocksToday) {
    const p = block.properties as Record<string, unknown>
    // Every target, not the first: a block may hold a batch of tasks.
    const edges = scheduledEdges.filter((e) => e.sourceId === block.id)
    for (const e of edges) scheduledTargets.add(e.targetId)

    const contents = edges
      .map((e) => ({ id: e.targetId, described: describe(e.targetId) }))
      .filter((c): c is { id: number; described: NonNullable<ReturnType<typeof describe>> } => !!c.described)

    // The prayer habit is already on the timeline as five timed slots.
    if (hiddenHabitId !== null && contents.some((c) => c.id === hiddenHabitId)) continue
    const allDone = contents.length > 0 && contents.every((c) => c.described.done)
    // One finished thing leaves the queue, as ticking a task always has. A
    // batch does not — see `completed` on NowItem.
    if (allDone && contents.length === 1) continue

    const label = typeof p.label === 'string' && p.label.trim() ? p.label.trim() : null
    const only = contents.length === 1 ? contents[0] : null
    const start = typeof p.startTime === 'string' ? p.startTime : null
    const end = typeof p.endTime === 'string' ? p.endTime : null

    items.push({
      id: block.id,
      kind: 'block',
      label: label ?? only?.described.label ?? (contents.length > 1 ? `${contents.length} tasks` : 'Time block'),
      startTime: start,
      endTime: end,
      minutes: start && end ? toMinutes(end) - toMinutes(start) : null,
      // Only a block holding exactly one thing can be ticked off as that
      // thing; a batch is ticked off item by item.
      targetId: only?.id ?? null,
      targetType: only?.described.type ?? null,
      note: p.autoScheduled ? 'scheduled for you' : null,
      children: contents.length > 1
        ? contents.map((c) => ({ id: c.id, type: c.described.type, name: c.described.label, done: c.described.done }))
        : undefined,
      ...(allDone ? { completed: true } : {}),
    })
  }

  for (const event of events) {
    const p = event.properties as Record<string, unknown>
    // Recurring events have one node and many occurrences, so the rule is
    // asked rather than the stored date compared.
    const occurs = eventOccursOn(
      {
        date: typeof p.date === 'string' ? p.date : null,
        frequency: typeof p.frequency === 'string' ? p.frequency : null,
        daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
        until: typeof p.until === 'string' ? p.until : null,
      },
      date,
    )
    if (!occurs) continue
    const start = typeof p.time === 'string' ? p.time : null
    const minutes = typeof p.duration === 'number' ? p.duration : 60
    items.push({
      id: event.id,
      kind: 'event',
      label: typeof p.name === 'string' ? p.name : `Event #${event.id}`,
      startTime: start,
      endTime: start ? minutesToTime(toMinutes(start) + minutes) : null,
      minutes,
      targetId: event.id,
      targetType: 'Event',
      note: typeof p.location === 'string' && p.location ? p.location : null,
    })
  }

  for (const habit of habits) {
    const p = habit.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    if (!isDueOn(frequency, daysOfWeek, dow)) continue
    if (habit.id === hiddenHabitId) continue
    if (scheduledTargets.has(habit.id)) continue

    const logged = habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === habit.id && lp.date === date && lp.completed === true
    })
    if (logged) continue

    items.push({
      id: habit.id,
      kind: 'habit',
      label: typeof p.name === 'string' ? p.name : `Habit #${habit.id}`,
      startTime: null,
      endTime: null,
      minutes: typeof p.durationMinutes === 'number' ? p.durationMinutes : null,
      targetId: habit.id,
      targetType: 'Habit',
      note: null,
    })
  }

  for (const task of tasks) {
    const p = task.properties as Record<string, unknown>
    const status = typeof p.status === 'string' ? p.status : 'todo'
    const dueDate = typeof p.dueDate === 'string' ? p.dueDate : null
    if (status === 'done' || !dueDate || dueDate > date) continue
    if (scheduledTargets.has(task.id)) continue

    items.push({
      id: task.id,
      kind: 'task',
      label: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${task.id}`,
      startTime: null,
      endTime: null,
      minutes: typeof p.estimatedMinutes === 'number' ? p.estimatedMinutes : DEFAULT_TASK_MINUTES,
      targetId: task.id,
      targetType: 'Task',
      note: dueDate < date ? 'overdue' : null,
    })
  }

  /*
   * Module items with a date. Each type names its own date and title fields,
   * and finished ones drop out: an assignment already submitted is not still
   * due, however today's date compares.
   */
  for (const item of dueItems) {
    const p = item.properties as Record<string, unknown>
    const status = typeof p.status === 'string' ? p.status : null
    const stage = typeof p.stage === 'string' ? p.stage : null
    if (status === 'submitted' || status === 'graded' || status === 'taken' || status === 'done') continue
    if (stage === 'published') continue

    const when =
      typeof p.dueDate === 'string' ? p.dueDate
        : typeof p.date === 'string' ? p.date
        : typeof p.publishDate === 'string' ? p.publishDate
        : null
    if (!when || when > date) continue
    // Already given a slot on the calendar, so it is on the timeline as a
    // block and must not be listed a second time.
    if (scheduledTargets.has(item.id)) continue

    const time =
      typeof p.time === 'string' ? p.time
        : typeof p.publishTime === 'string' ? p.publishTime
        : null

    const label =
      typeof p.name === 'string' ? p.name
        : typeof p.title === 'string' ? p.title
        : `${item.type} #${item.id}`

    items.push({
      id: item.id,
      kind: 'due',
      label,
      startTime: time,
      endTime: null,
      minutes: typeof p.duration === 'number' ? p.duration : null,
      targetId: item.id,
      targetType: item.type,
      note: when < date ? 'overdue'
        : typeof p.location === 'string' && p.location ? p.location
        : item.type.toLowerCase(),
    })
  }

  // Timed things in time order; the rest after, since they can happen in any
  // gap.
  items.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
    if (a.startTime) return -1
    if (b.startTime) return 1
    return 0
  })

  return items
}

/** A habit due today with no slot of its own, for the column beside Now. */
export interface TodayHabit {
  id: number
  name: string
  done: boolean
  minutes: number | null
  /** The part of the day it usually happens in, when one was said. */
  dayPart: string | null
}

/**
 * Every habit due today that is not already on the clock, finished or not.
 *
 * The queue drops a habit once it is logged, which is right for "what next"
 * and wrong for a checklist: ticking the third of five off should leave
 * three ticks showing, not two items and no sign of progress. Habits that
 * sit in a block today are left out — they are on the timeline, at a time.
 */
export function buildTodayHabits({
  date,
  habits,
  habitLogs,
  timeBlocks,
  scheduledEdges,
  hiddenHabitId = null,
}: {
  date: string
  habits: Node[]
  habitLogs: Node[]
  timeBlocks: Node[]
  scheduledEdges: Edge[]
  /** The prayer habit, while its five are on the timeline instead. */
  hiddenHabitId?: number | null
}): TodayHabit[] {
  const dow = new Date(date + 'T00:00:00').getDay()
  const blocksToday = new Set(timeBlocks.filter((b) => blockOccursOn(b, date)).map((b) => b.id))
  const onTheClock = new Set(scheduledEdges.filter((e) => blocksToday.has(e.sourceId)).map((e) => e.targetId))

  return habits
    .filter((habit) => {
      const p = habit.properties as Record<string, unknown>
      const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
      const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
      return isDueOn(frequency, daysOfWeek, dow) && habit.id !== hiddenHabitId && !onTheClock.has(habit.id)
    })
    .map((habit) => {
      const p = habit.properties as Record<string, unknown>
      return {
        id: habit.id,
        name: typeof p.name === 'string' ? p.name : `Habit #${habit.id}`,
        done: habitLogs.some((l) => {
          const lp = l.properties as Record<string, unknown>
          return lp.habitNodeId === habit.id && lp.date === date && lp.completed === true
        }),
        minutes: typeof p.durationMinutes === 'number' ? p.durationMinutes : null,
        dayPart: typeof p.dayPart === 'string' && p.dayPart ? p.dayPart : null,
      }
    })
    // Open ones first, so what is left is what is read.
    .sort((a, b) => Number(a.done) - Number(b.done))
}

/** A task due in the next few days. */
export interface UpcomingTask {
  id: number
  name: string
  dueDate: string
  priority: string | null
}

/**
 * What is coming, so today can be spent on it before it is due.
 *
 * Today's own and overdue tasks are already in the queue; this is the
 * stretch after, which the page used to say nothing about until the morning
 * each one fell due.
 */
export function buildUpcomingTasks({ date, until, tasks }: {
  date: string
  /** Last day included, YYYY-MM-DD. */
  until: string
  tasks: Node[]
}): UpcomingTask[] {
  return tasks
    .flatMap((task) => {
      const p = task.properties as Record<string, unknown>
      const dueDate = typeof p.dueDate === 'string' ? p.dueDate : null
      if (p.status === 'done' || !dueDate || dueDate <= date || dueDate > until) return []
      return [{
        id: task.id,
        name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${task.id}`,
        dueDate,
        priority: typeof p.priority === 'string' ? p.priority : null,
      }]
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}
