/**
 * Working out when things should happen.
 *
 * Kept pure and free of database access so the same logic can answer two
 * different questions — "what would you suggest?" and "go ahead and do it" —
 * without the two ever drifting apart, and so it can be tested directly.
 */

/**
 * The stretch of the day things may be scheduled into.
 *
 * Not office hours — the hours someone is awake. An 09:00-18:00 default
 * quietly assumed a working day and left mornings and evenings unusable for
 * anything, which is wrong for a tool meant to hold a whole life. Overridden
 * per person in Settings ("Day starts" / "Day ends").
 */
export const DEFAULT_DAY = { start: '07:00', end: '23:00' } as const

export const DEFAULT_TASK_MINUTES = 30
/** Suggested times land on a 5-minute boundary; 10:24 reads as a glitch. */
const SNAP_MINUTES = 5
/** A habit with no stated length still needs a slot wide enough to see. */
export const DEFAULT_HABIT_MINUTES = 15

export interface SchedulableTask {
  id: number
  name: string
  dueDate: string | null
  priority: string
  minutes: number
  kind?: 'task' | 'habit'
  /**
   * Minutes past midnight this usually happens, when it has a usual time.
   * A habit is defined partly by when it is done — the morning stretch is a
   * morning thing — so a remembered slot is honoured before anything is
   * spread into free space.
   */
  preferredStart?: number | null
  /**
   * The stretch of the day this belongs in, when it belongs in one.
   *
   * A waking day is sixteen hours and almost none of it is interchangeable:
   * deep work belongs in the working part, a workout in the evening, the
   * morning routine in the morning. Without this the planner treated 07:00
   * and 22:00 as the same offer and put things wherever a gap happened to
   * be, which is how a plan stops resembling a day someone would live.
   */
  window?: BusyInterval | null
  /** What that part is called, so the suggestion can say why it is there. */
  windowName?: string | null
  /**
   * Work pulled forward from a later day. Placed only in the room left once
   * everything else has had its turn, and not reported when there is none.
   */
  optional?: boolean
}

export interface BusyInterval {
  start: number
  end: number
}

export interface Placement {
  taskId: number
  name: string
  kind: 'task' | 'habit'
  startTime: string
  endTime: string
  minutes: number
  /** Shown to the user, so the suggestion can be judged rather than just accepted. */
  reason: string
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Overlapping stretches merged into the time they actually occupy.
 *
 * A day's commitment is wall-clock time, not the sum of its entries. Three
 * things booked across 13:30–17:00 take three and a half hours, not ten and a
 * half — and adding them up is what told an ordinary day it was two hours
 * overbooked. Callers that mean "how much of the day is spoken for" want
 * this; nothing meaningful ever wants the raw sum.
 */
export function mergeIntervals(intervals: BusyInterval[]): BusyInterval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const merged: BusyInterval[] = []
  for (const next of sorted) {
    const last = merged[merged.length - 1]
    // Touching counts as continuous: 13:30–15:00 then 15:00–17:00 is one
    // unbroken stretch of the afternoon, not two with a gap of zero.
    if (last && next.start <= last.end) last.end = Math.max(last.end, next.end)
    else merged.push({ ...next })
  }
  return merged
}

/** Minutes of the day covered by these stretches, counting overlap once. */
export function occupiedMinutes(intervals: BusyInterval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0)
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

/** The smallest piece a long task is split into. Less than this is not a sitting. */
export const MIN_CHUNK_MINUTES = 30
/** A task split more ways than this is not being planned, it is being scattered. */
const MAX_CHUNKS = 4
const DAY_MINUTES = 24 * 60

/** Something the planner could not find room for, and why — shown, never dropped silently. */
export interface Unplaced {
  taskId: number
  name: string
  kind: 'task' | 'habit'
  minutes: number
  reason: string
}

export interface PlanResult {
  placements: Placement[]
  unplaced: Unplaced[]
}

/** "HH:MM" to minutes, or null for anything that is not a real time. */
export function parseTime(time: unknown): number | null {
  if (typeof time !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  // 24:00 is a real end of day; anything past it is not.
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null
  return h * 60 + min
}

/**
 * Busy time made safe to reason about.
 *
 * A stretch that ends before it starts crosses midnight (23:00–01:00), and
 * counts as running to the end of this day rather than as nothing at all —
 * which is what every clash test did with it before, leaving a late shift
 * looking free. Anything unreadable is dropped here, once, instead of turning
 * into NaN comparisons that are silently false.
 */
function normaliseBusy(busy: BusyInterval[]): BusyInterval[] {
  return busy
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))
    .map((b) => ({
      start: Math.max(0, Math.min(DAY_MINUTES, b.start)),
      end: b.end <= b.start ? DAY_MINUTES : Math.min(DAY_MINUTES, b.end),
    }))
    .filter((b) => b.end > b.start)
}

/**
 * Fits tasks into the gaps a day actually has left.
 *
 * Busy intervals are treated as immovable: this only ever proposes free time,
 * so nothing the user scheduled deliberately is displaced. A task that will
 * not fit is never crammed in or double-booked — it comes back in `unplaced`
 * with the reason, because an honest "this did not fit" is worth more than a
 * plan that quietly lost it.
 */
export function planSchedule({
  tasks,
  busy,
  workingHours,
  earliestMinutes,
  gapMinutes = 0,
  preferredWindows = [],
}: {
  tasks: SchedulableTask[]
  busy: BusyInterval[]
  workingHours: { start: string; end: string }
  /** Floor for the first placement — used to avoid scheduling into hours already gone. */
  earliestMinutes?: number
  /** Breathing room left after each placement, so a day is not packed end to end. */
  gapMinutes?: number
  /**
   * Stretches of the day this person actually gets things done in, best
   * first (see src/lib/availability.ts). Tried before the rest of the day,
   * so work lands when it is likely to happen rather than merely when it fits.
   */
  preferredWindows?: BusyInterval[]
}): PlanResult {
  const dayStart = parseTime(workingHours.start) ?? parseTime(DEFAULT_DAY.start)!
  const parsedEnd = parseTime(workingHours.end) ?? parseTime(DEFAULT_DAY.end)!
  // A day that "ends" before it starts runs to midnight rather than not at all.
  const dayEnd = parsedEnd > dayStart ? parsedEnd : DAY_MINUTES
  const floor = Math.max(dayStart, Number.isFinite(earliestMinutes) ? earliestMinutes! : dayStart)
  const gap = Number.isFinite(gapMinutes) ? Math.max(0, gapMinutes) : 0

  const taken = normaliseBusy(busy).sort((a, b) => a.start - b.start)
  const placements: Placement[] = []
  const unplaced: Unplaced[] = []

  // Lengths that are missing, zero or absurd become something plannable.
  const items = tasks.map((t) => ({
    ...t,
    minutes: Number.isFinite(t.minutes) && t.minutes > 0
      ? Math.min(Math.round(t.minutes), dayEnd - dayStart)
      : t.kind === 'habit' ? DEFAULT_HABIT_MINUTES : DEFAULT_TASK_MINUTES,
    preferredStart: Number.isFinite(t.preferredStart) ? t.preferredStart : null,
    window: t.window && Number.isFinite(t.window.start) && Number.isFinite(t.window.end) && t.window.end > t.window.start
      ? t.window
      : null,
  }))

  const clashes = (start: number, minutes: number) => taken.some((b) => start < b.end && start + minutes > b.start)

  const free = (item: SchedulableTask, start: number, minutes: number) =>
    start >= floor &&
    start + minutes <= dayEnd &&
    // Its own part of the day, when it has one, is a hard edge: a thing that
    // belongs to the evening is not placed at breakfast because there is room.
    (!item.window || (start >= item.window.start && start + minutes <= item.window.end)) &&
    !clashes(start, minutes)

  const put = (item: SchedulableTask, start: number, minutes: number, reason: string) => {
    placements.push({
      taskId: item.id,
      name: item.name,
      kind: item.kind ?? 'task',
      startTime: fromMinutes(start),
      endTime: fromMinutes(start + minutes),
      minutes,
      reason,
    })
    taken.push({ start, end: start + minutes })
    taken.sort((a, b) => a.start - b.start)
  }

  // Anything with a usual time gets first refusal on it, in time order, so a
  // habit stays where it belongs instead of being shuffled somewhere new each
  // morning. One that no longer fits falls through to be placed like the rest.
  const displaced: typeof items = []
  for (const item of items.filter((t) => t.preferredStart != null).sort((a, b) => a.preferredStart! - b.preferredStart!)) {
    if (free(item, item.preferredStart!, item.minutes)) put(item, item.preferredStart!, item.minutes, reasonFor(item))
    else displaced.push({ ...item, preferredStart: null })
  }

  // Most overdue first, then higher priority within the same due date — the
  // order someone would pick doing this by hand. An undated item sorts last
  // rather than first, which an empty string would have done.
  const dueKey = (d: string | null) => d ?? '9999-12-31'
  const remaining = [...items.filter((t) => t.preferredStart == null), ...displaced].sort((a, b) => {
    if (!!a.optional !== !!b.optional) return a.optional ? 1 : -1
    const byDate = dueKey(a.dueDate).localeCompare(dueKey(b.dueDate))
    if (byDate !== 0) return byDate
    return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
  })

  const snap = (m: number) => Math.ceil(m / SNAP_MINUTES) * SNAP_MINUTES

  /** Earliest free, round start in [from, to) that fits `minutes`, or null. */
  const firstFit = (from: number, to: number, minutes: number): number | null => {
    const limit = Math.min(to, dayEnd)
    let scan = snap(Math.max(from, floor))
    while (scan + minutes <= limit) {
      const clash = taken.find((b) => scan < b.end && scan + minutes > b.start)
      if (!clash) return scan
      // step past whatever is in the way, back onto a round number
      scan = snap(clash.end)
    }
    return null
  }

  /** Every free, round stretch in [from, to), in time order. */
  const gapsIn = (from: number, to: number): BusyInterval[] => {
    const limit = Math.min(to, dayEnd)
    const out: BusyInterval[] = []
    let scan = snap(Math.max(from, floor))
    for (const b of mergeIntervals(taken)) {
      if (b.end <= scan) continue
      if (b.start >= limit) break
      if (b.start > scan) out.push({ start: scan, end: Math.floor(b.start / SNAP_MINUTES) * SNAP_MINUTES })
      scan = snap(Math.max(scan, b.end))
    }
    if (scan < limit) out.push({ start: scan, end: limit })
    return out.filter((g) => g.end > g.start)
  }

  /**
   * A task too long for any one gap, in pieces.
   *
   * Two hours of revision with only forty-five-minute gaps used to be left
   * out of every plan, every day, until it was overdue and still unplanned.
   * Split into sittings of at least MIN_CHUNK_MINUTES instead, earliest
   * first. All or nothing: half a task on the calendar reads as the whole of
   * it, so if the pieces cannot cover it none are placed.
   */
  const placeInChunks = (item: SchedulableTask, from: number, to: number): boolean => {
    if (item.minutes < MIN_CHUNK_MINUTES * 2) return false
    const pieces: BusyInterval[] = []
    let left = item.minutes
    for (const g of gapsIn(from, to)) {
      if (left <= 0 || pieces.length === MAX_CHUNKS) break
      const room = g.end - g.start
      if (room < MIN_CHUNK_MINUTES) continue
      // Never leave a remainder too small to be a sitting of its own.
      let take = Math.min(room, left)
      if (left - take > 0 && left - take < MIN_CHUNK_MINUTES) take = left - MIN_CHUNK_MINUTES
      if (take < MIN_CHUNK_MINUTES) continue
      pieces.push({ start: g.start, end: g.start + take })
      left -= take
    }
    if (left > 0) return false
    pieces.forEach((piece, i) =>
      put(item, piece.start, piece.end - piece.start, `${reasonFor(item)} · part ${i + 1} of ${pieces.length}`),
    )
    return true
  }

  let cursor = floor
  for (const item of remaining) {
    let start: number | null = null
    let inGoodWindow = false
    const [lo, hi] = item.window ? [item.window.start, item.window.end] : [floor, dayEnd]

    // A good window first — inside its own part of the day, if it has one.
    for (const w of preferredWindows) {
      const from = Math.max(w.start, lo, item.window ? lo : cursor)
      const to = Math.min(w.end, hi)
      if (to <= from) continue
      start = firstFit(from, to, item.minutes)
      if (start !== null) { inGoodWindow = true; break }
    }
    /*
     * Then anywhere it is allowed. The cursor keeps a plan walking forward
     * through the day so things are spread rather than stacked — but once it
     * has walked past a hole, that hole is still free time, and a task left
     * out while the morning sat empty was a plan throwing away its best hour.
     */
    if (start === null && !item.window) start = firstFit(cursor, dayEnd, item.minutes)
    if (start === null) start = firstFit(lo, hi, item.minutes)

    if (start !== null) {
      put(item, start, item.minutes, reasonFor(item, inGoodWindow))
      // Only an unconstrained placement moves the cursor; a thing dropped into
      // its own part of the day says nothing about where the next one goes.
      if (!item.window) cursor = start + item.minutes + gap
      continue
    }

    if ((item.kind ?? 'task') === 'task' && placeInChunks(item, lo, hi)) continue

    // Not placed — and, unlike before, not the end of the plan: a two-hour
    // task with no room says nothing about the fifteen-minute habit after it.
    if (item.optional) continue
    const room = gapsIn(lo, hi).reduce((longest, g) => Math.max(longest, g.end - g.start), 0)
    unplaced.push({
      taskId: item.id,
      name: item.name,
      kind: item.kind ?? 'task',
      minutes: item.minutes,
      reason: floor >= hi
        ? item.windowName ? `${item.windowName.toLowerCase()} is already over` : 'the day is already over'
        : room === 0
          ? item.windowName ? `${item.windowName.toLowerCase()} is full` : 'no free time left'
          : `needs ${item.minutes} min, longest free stretch is ${room}`,
    })
  }

  return { placements: placements.sort((a, b) => a.startTime.localeCompare(b.startTime)), unplaced }
}

function reasonFor(task: SchedulableTask, inGoodWindow = false): string {
  const parts: string[] = []
  if (task.kind === 'habit') parts.push(task.preferredStart != null ? 'your usual time' : 'daily habit')
  else if (task.optional) parts.push(task.dueDate ? `ahead of ${task.dueDate}` : 'from your list')
  else if (task.priority === 'high') parts.push('high priority')
  if (task.windowName) parts.push(task.windowName.toLowerCase())
  if (inGoodWindow) parts.push('when you usually get things done')
  parts.push(`${task.minutes} min`)
  return parts.join(' · ')
}
