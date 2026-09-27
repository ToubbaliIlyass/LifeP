import { getNodes, getEdges, createNode, createEdge, deleteNode } from '@/lib/graph/queries'
import { eventOccursOn, isDueOn, addDays } from '@/lib/date'
import { clockIn, type UserClock } from '@/lib/clock'
import {
  planSchedule,
  mergeIntervals,
  toMinutes,
  DEFAULT_TASK_MINUTES,
  DEFAULT_HABIT_MINUTES,
  type BusyInterval,
  type Placement,
  type PlanResult,
  type Unplaced,
  DEFAULT_DAY,
  type SchedulableTask,
} from '@/lib/schedule'
import { blockOccursOn, firmnessOf, isDone } from '@/lib/sessions'
import { loadAvailability } from '@/lib/availability'
import { readSettings, type DayPart } from '@/lib/settings'
import { workTypes } from '@/lib/modules'
import { prayerTimesFor, PRAYER_MINUTES } from '@/lib/prayers'

/**
 * Reads a day out of the database and works out what could be scheduled into
 * it. Shared by the suggestion endpoint and the apply endpoint so the plan a
 * user approves is the plan that gets written.
 */
/** How far ahead a free slot may be spent on work that is not due yet. */
const LOOKAHEAD_DAYS = 3
/**
 * Undated tasks offered to one day's spare time, at most. A task with no due
 * date used to be planned never — it sat in a list nobody opened — but the
 * whole backlog poured into one free afternoon would bury the day instead.
 */
const UNDATED_PER_DAY = 3
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

export async function planDay(
  userId: number,
  date: string,
  workingHours: { start: string; end: string },
  /**
   * 'habits' plans only the habits, leaving tasks where they are. Used when
   * re-laying out habits on their own, so accepting a fresh habit layout
   * cannot quietly move work the user had already placed.
   */
  include: 'all' | 'habits' = 'all',
  options: {
    /** The user's own date and time — see src/lib/clock.ts. */
    clock?: UserClock
    /**
     * Blocks to plan as though they were already gone. "Plan my day" replaces
     * the day's tentative blocks; planning around them first and deleting
     * only once the new plan exists means a failure half way leaves the old
     * plan standing instead of an empty day.
     */
    ignoreBlockIds?: ReadonlySet<number>
    /**
     * Items put off with "Later": id → the earliest minute they may now go.
     * Without it, a task pushed off the current slot came straight back to
     * the same slot, that being the first free one.
     */
    notBefore?: ReadonlyMap<number, number>
  } = {},
): Promise<PlanResult> {
  const clock = options.clock ?? clockIn()
  const ignored = options.ignoreBlockIds ?? new Set<number>()
  const tasks = include === 'habits' ? [] : await getNodes(userId, { type: 'Task' })
  /*
   * The parts of the day, if this person has cut theirs up. A Task or Habit
   * names one in its `dayPart` property and is then only ever planned inside
   * it; anything naming a part that no longer exists is simply unconstrained
   * again, which is kinder than refusing to plan it at all.
   *
   * Parts can be limited to certain days, so the lookup is resolved against
   * the day being planned: the part named is preferred, and if it does not
   * apply today another part of the same name that does — "deep work" can be
   * one window on weekdays and a different one at weekends. If none of them
   * covers today the item is unconstrained rather than unplaceable, for the
   * same reason a deleted part is.
   */
  const settings = await readSettings(userId)
  const dayParts = settings.dayParts ?? []
  const dow = new Date(date + 'T00:00:00').getDay()
  const appliesToday = (p: DayPart) => !p.days?.length || p.days.includes(dow)
  const partById = new Map(dayParts.map((p) => [p.id, p]))
  const windowFor = (props: Record<string, unknown>): { part: DayPart | null } => {
    const named = typeof props.dayPart === 'string' ? props.dayPart : null
    if (!named) return { part: null }
    const exact = partById.get(named) ?? dayParts.find((p) => p.name.toLowerCase() === named.toLowerCase()) ?? null
    if (exact && appliesToday(exact)) return { part: exact }
    const sameNameToday = exact
      ? dayParts.find((p) => p.name.toLowerCase() === exact.name.toLowerCase() && appliesToday(p))
      : undefined
    return { part: sameNameToday ?? null }
  }
  const asWindow = (part: DayPart | null) =>
    part ? { window: { start: toMinutes(part.start), end: toMinutes(part.end) }, windowName: part.name } : {}
  // What has been learned and told about when this person can do things.
  const availability = await loadAvailability(userId)

  const scheduledForEdges = await getEdges(userId, { type: 'scheduled-for' })
  const timeBlocks = (await getNodes(userId, { type: 'TimeBlock' })).filter((b) => !ignored.has(b.id))
  const blockById = new Map(timeBlocks.map((b) => [b.id, b]))

  /*
   * Already on the calendar, from today on, is left alone — re-placing
   * something the user has already dealt with would be the opposite of help.
   *
   * From today on, not ever. This used to count a block on any date, so a
   * task planned for Monday and not done on Monday was "scheduled" for good:
   * no later plan would touch it, and it fell out of the day it was most
   * overdue on. A slot that has passed without the work being done is a
   * missed slot, and the work is back to needing one.
   */
  const alreadyScheduled = new Set(
    scheduledForEdges
      .filter((e) => {
        const block = blockById.get(e.sourceId)
        if (!block) return false
        const bp = block.properties as Record<string, unknown>
        if (typeof bp.frequency === 'string' && bp.frequency !== 'once') return true
        return typeof bp.date !== 'string' || bp.date >= clock.date
      })
      .map((e) => e.targetId),
  )

  const aheadUntil = addDays(date, LOOKAHEAD_DAYS)
  const taskRows = tasks
    .map((t) => {
      const p = t.properties as Record<string, unknown>
      return {
        id: t.id,
        props: p,
        createdAt: t.createdAt,
        name:
          typeof p.name === 'string' ? p.name
            : typeof p.title === 'string' ? p.title
            : `Task #${t.id}`,
        status: typeof p.status === 'string' ? p.status : 'todo',
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
        priority: typeof p.priority === 'string' ? p.priority : 'medium',
        minutes:
          typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0
            ? p.estimatedMinutes
            : DEFAULT_TASK_MINUTES,
      }
    })
    .filter((t) => t.status !== 'done')
  const undated = taskRows.filter((t) => t.dueDate === null)
  const candidates: SchedulableTask[] = taskRows
    /*
     * Due by this day or already late — and, as filler, the next few days'.
     * Those only take what room is left once everything due is placed (they
     * sort after it), so they can never bury what matters now; but a free
     * afternoon used to go unused while Thursday's essay waited for Thursday.
     */
    .filter((t) => t.dueDate !== null && t.dueDate <= aheadUntil)
    .filter((t) => !alreadyScheduled.has(t.id))
    // And a few with no date at all, most important and oldest first — they
    // too only ever get what room is left.
    .concat(
      undated
        .filter((t) => !alreadyScheduled.has(t.id))
        .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) || a.createdAt.localeCompare(b.createdAt))
        .slice(0, UNDATED_PER_DAY),
    )
    .map(({ id, name, dueDate, priority, minutes, props }) => ({
      id, name, dueDate, priority, minutes, kind: 'task' as const,
      optional: dueDate === null || dueDate > date,
      ...asWindow(windowFor(props).part),
      // Only a stated preference ("I study in the mornings") can pin a task;
      // a one-off task has no history of its own to learn from.
      // Work pulled forward from a later day has no claim on a usual slot
      // ahead of what is due today.
      preferredStart: dueDate === null || dueDate > date ? null
        : availability.rules.some((r) => r.kind === 'prefer') ? availability.usualStart(id, name, dow) : null,
    }))

  /*
   * Habits belong in the plan, not stamped onto the calendar behind the user's
   * back. They used to be written straight in at a hardcoded 08:00 the moment
   * a day was opened — outside the working day, all on the same slot, and
   * never approved by anyone. Now they go through exactly the same suggestion
   * the tasks do, so a time is proposed and the user says yes.
   *
   * "Already scheduled" is per-day for a habit (it recurs) but any-day for a
   * task (it does not).
   */
  const scheduledOnThisDate = new Set(
    scheduledForEdges
      .filter((e) => {
        const block = blockById.get(e.sourceId)
        // Recurrence-aware: a habit sitting in a daily morning routine is
        // scheduled every day that routine runs, not only on the one date
        // the block itself carries. Comparing dates re-planned it on top of
        // its own routine every morning.
        return !!block && blockOccursOn(block, date)
      })
      .map((e) => e.targetId),
  )

  /*
   * Work owned by the enabled modules — an assignment due Thursday, a piece
   * going out on Friday. It needs hours like anything else, and until now
   * the planner could not see it: a student's actual week was invisible to
   * the one thing meant to lay their week out.
   *
   * Something with a time of its own is not planned but avoided. An exam at
   * 10:00 is an appointment; offering it a "good slot" would be nonsense,
   * while ignoring it would plan straight over it.
   */
  const moduleTypes = workTypes(settings)
  const fixedModuleTimes: BusyInterval[] = []
  if (include !== 'habits' && moduleTypes.size > 0) {
    for (const node of await getNodes(userId)) {
      if (!moduleTypes.has(node.type)) continue
      const p = node.properties as Record<string, unknown>
      const status = typeof p.status === 'string' ? p.status : null
      const stage = typeof p.stage === 'string' ? p.stage : null
      if (status === 'submitted' || status === 'graded' || status === 'taken' || status === 'done') continue
      if (stage === 'published') continue

      const when =
        typeof p.dueDate === 'string' ? p.dueDate
          : typeof p.date === 'string' ? p.date
          : typeof p.publishDate === 'string' ? p.publishDate
          : null
      if (!when) continue

      const time = typeof p.time === 'string' ? p.time : typeof p.publishTime === 'string' ? p.publishTime : null
      if (time) {
        if (when === date) {
          const start = toMinutes(time)
          fixedModuleTimes.push({ start, end: start + (typeof p.duration === 'number' ? p.duration : 60) })
        }
        continue
      }

      if (when > date) continue
      if (alreadyScheduled.has(node.id)) continue

      const name = typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${node.type} #${node.id}`
      candidates.push({
        id: node.id,
        name,
        dueDate: when,
        // Due work outranks work that merely could be done today.
        priority: 'high',
        minutes:
          typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0 ? p.estimatedMinutes : DEFAULT_TASK_MINUTES,
        kind: 'task',
        preferredStart: null,
        ...asWindow(windowFor(p).part),
      })
    }
  }

  const habitLogs = await getNodes(userId, { type: 'HabitLog' })

  for (const habit of await getNodes(userId, { type: 'Habit' })) {
    const p = habit.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    if (!isDueOn(frequency, daysOfWeek, dow)) continue
    if (scheduledOnThisDate.has(habit.id)) continue

    /*
     * Some habits belong to the day rather than to a time in it — praying
     * five times, drinking water, standing up now and then. Giving those a
     * block is a category error: it invents a commitment that was never
     * made, and eats space real appointments need. They stay in the Now
     * queue as untimed, where they can be ticked off whenever they happen.
     */
    if (p.anytime === true) continue

    const done = habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === habit.id && lp.date === date && lp.completed === true
    })
    if (done) continue

    // A habit recorded as taking no time still needs a slot with a height.
    const stated = typeof p.durationMinutes === 'number' ? p.durationMinutes : 0
    const minutes = stated > 0 ? stated : DEFAULT_HABIT_MINUTES

    // The time it was last given, if it has one — see preferredStart.
    const previous = scheduledForEdges
      .filter((e) => e.targetId === habit.id)
      .map((e) => blockById.get(e.sourceId))
      .map((b) => (b ? (b.properties as Record<string, unknown>) : null))
      .filter((bp): bp is Record<string, unknown> => !!bp && typeof bp.date === 'string' && (bp.date as string) < date)
      .sort((a, b) => (b.date as string).localeCompare(a.date as string))[0]

    const name = typeof p.name === 'string' ? p.name : `Habit #${habit.id}`
    /*
     * When it actually gets done wins; where it was last *put* is only the
     * fallback.
     *
     * The other way round could not learn anything. Each day copied the
     * previous day's slot forward, so the first time a habit was placed — by
     * a planner that knew nothing yet — became the time it was planned at
     * forever, no matter how many times it really happened five hours later.
     * `usualStart` only answers once there is enough recent evidence to
     * cluster (see availability.ts), so the copy still carries a habit that
     * has never been observed.
     */
    const learned = availability.usualStart(habit.id, name, dow)
    const preferredStart =
      learned ?? (previous && typeof previous.startTime === 'string' ? toMinutes(previous.startTime) : null)

    candidates.push({
      id: habit.id,
      name,
      dueDate: null,
      priority: 'medium',
      minutes,
      kind: 'habit',
      preferredStart,
      ...asWindow(windowFor(p).part),
    })
  }

  if (candidates.length === 0) return { placements: [], unplaced: [] }
  const isFiller = (c: SchedulableTask) => c.optional === true

  const busy: BusyInterval[] = []
  for (const block of timeBlocks) {
    const p = block.properties as Record<string, unknown>
    // Asked, not compared. A routine occurs on many days while carrying one
    // date of its own, so a date comparison left every morning after the
    // first looking free and let work be planned straight over it.
    if (!blockOccursOn(block, date)) continue
    if (typeof p.startTime === 'string' && typeof p.endTime === 'string') {
      busy.push({ start: toMinutes(p.startTime), end: toMinutes(p.endTime) })
    }
  }
  for (const event of await getNodes(userId, { type: 'Event' })) {
    const p = event.properties as Record<string, unknown>
    if (typeof p.time !== 'string') continue
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
    const start = toMinutes(p.time)
    busy.push({ start, end: start + (typeof p.duration === 'number' ? p.duration : 60) })
  }
  // Time the user said they are not available (work, class, commute) is as
  // off-limits as an appointment.
  busy.push(...availability.unavailable(date))
  // And anything from a module that happens at a fixed time today.
  busy.push(...fixedModuleTimes)
  // And prayer, when it is on: the Now queue lists the five as things to do,
  // so the plan must not put a task on top of one.
  for (const p of prayerTimesFor(settings, date, clock.zone ?? settings.timeZone ?? null)) {
    const start = toMinutes(p.time)
    busy.push({ start, end: start + PRAYER_MINUTES })
  }

  // On today itself — the user's today — hours that have already gone are
  // not available.
  const earliestMinutes = date === clock.date ? Math.ceil(clock.minutes / 15) * 15 : undefined

  /*
   * Spread rather than packed. Everything placed back to back from the start
   * of the day is how eight habits ended up in one unreadable stack; sharing
   * the day's spare minutes between them gives each one room and makes the
   * plan look like a day someone would actually live. Capped so a nearly
   * empty day does not fling two items twelve hours apart.
   */
  const required = candidates.filter((c) => !isFiller(c))
  const needed = required.reduce((sum, c) => sum + c.minutes, 0)
  const windowStart = Math.max(toMinutes(workingHours.start), earliestMinutes ?? 0)
  const windowEnd = toMinutes(workingHours.end)
  // Busy time counted once where it overlaps — a class inside a shift is not
  // two hours of the day gone.
  const busyInDay = mergeIntervals(
    busy.map((b) => ({ start: Math.max(b.start, windowStart), end: Math.min(b.end, windowEnd) })),
  ).reduce((sum, b) => sum + (b.end - b.start), 0)
  const spare = windowEnd - windowStart - busyInDay - needed
  const gapMinutes =
    required.length > 1 ? Math.max(0, Math.min(60, Math.floor(spare / required.length))) : 0

  // Put off with "Later": only from the given minute on, never at a usual
  // slot that is earlier, and still inside its own part of the day.
  const deferred = options.notBefore ?? new Map<number, number>()
  const planned = candidates.map((c) => {
    const from = deferred.get(c.id)
    if (from === undefined) return c
    const end = c.window?.end ?? toMinutes(workingHours.end)
    const start = Math.max(from, c.window?.start ?? 0)
    return { ...c, preferredStart: null, window: { start, end }, windowName: c.windowName ?? 'later today' }
  })

  return planSchedule({
    tasks: planned,
    busy,
    workingHours,
    earliestMinutes,
    gapMinutes,
    preferredWindows: availability.preferredWindows(date),
  })
}

export interface ReplanResult {
  date: string
  /** Tentative blocks the new plan replaced. */
  cleared: number
  placements: Placement[]
  unplaced: Unplaced[]
}

/**
 * "Plan my day", written: the day's tentative layout replaced by a fresh one.
 *
 * The Plan button and the assistant both come through here, so a day planned
 * by talking is planned exactly as one planned by pressing a button.
 *
 * The calendar holds two kinds of thing. A commitment — a class, a shift, an
 * appointment, a time the user agreed to — is a promise and is never moved.
 * A tentative block is only where the planner last put something, and is
 * fair game: it is thrown away and the day laid out again from what is known
 * now. On today, the hours already gone are left exactly as they were —
 * they are a record of the day, and the evidence the planner learns from.
 *
 * Planned first, as though the old tentative blocks were already gone, and
 * only then written: a failure in between leaves the old plan standing
 * rather than an emptied day.
 */
export async function replanDay(
  userId: number,
  date: string,
  clock: UserClock,
  /** See `notBefore` on planDay. */
  notBefore?: ReadonlyMap<number, number>,
): Promise<ReplanResult> {
  const settings = await readSettings(userId)
  const hours = settings.workingHours ?? DEFAULT_DAY

  const allNodes = await getNodes(userId)
  const byId = new Map(allNodes.map((n) => [n.id, n]))
  const habitLogs = allNodes.filter((n) => n.type === 'HabitLog')
  const blockById = new Map(allNodes.filter((n) => n.type === 'TimeBlock').map((b) => [b.id, b]))
  const scheduledEdges = await getEdges(userId, { type: 'scheduled-for' })

  const contents = new Map<number, number[]>()
  for (const edge of scheduledEdges) {
    if (!blockById.has(edge.sourceId)) continue
    contents.set(edge.sourceId, [...(contents.get(edge.sourceId) ?? []), edge.targetId])
  }

  const startedFloor = date === clock.date ? clock.minutes : -1
  const replaced = new Set<number>()
  for (const [blockId, targets] of contents) {
    const p = blockById.get(blockId)!.properties as Record<string, unknown>
    if (p.date !== date) continue
    if (firmnessOf(p) !== 'tentative') continue
    // A routine reaches far beyond this one day; clearing it here would wipe
    // every other occurrence with it.
    if (typeof p.frequency === 'string' && p.frequency !== 'once') continue
    if (typeof p.startTime === 'string' && toMinutes(p.startTime) < startedFloor) continue
    // Something already ticked off is a record of the day, not a plan for it.
    const done = targets.every((id) => {
      const node = byId.get(id)
      return node ? isDone(node, habitLogs, date) : false
    })
    if (targets.length > 0 && done) continue
    replaced.add(blockId)
  }

  const { placements, unplaced } = await planDay(userId, date, hours, 'all', { clock, ignoreBlockIds: replaced, notBefore })

  // The edge goes with the block, so the item returns to the unplanned rail.
  for (const id of replaced) await deleteNode(userId, id)
  for (const p of placements) {
    const block = await createNode(userId, 'TimeBlock', {
      date,
      startTime: p.startTime,
      endTime: p.endTime,
      autoScheduled: true,
      firmness: 'tentative',
    })
    await createEdge(userId, block.id, p.taskId, 'scheduled-for', {})
  }

  return { date, cleared: replaced.size, placements, unplaced }
}
