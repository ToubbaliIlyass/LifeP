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

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

/**
 * Fits tasks into the gaps a day actually has left.
 *
 * Busy intervals are treated as immovable: this only ever proposes free time,
 * so nothing the user scheduled deliberately is displaced. A task that will
 * not fit is left out rather than crammed in or double-booked — an
 * over-committed plan is worse than an honest one.
 */
export function planSchedule({
  tasks,
  busy,
  workingHours,
  earliestMinutes,
  gapMinutes = 0,
}: {
  tasks: SchedulableTask[]
  busy: BusyInterval[]
  workingHours: { start: string; end: string }
  /** Floor for the first placement — used to avoid scheduling into hours already gone. */
  earliestMinutes?: number
  /** Breathing room left after each placement, so a day is not packed end to end. */
  gapMinutes?: number
}): Placement[] {
  const dayStart = toMinutes(workingHours.start)
  const dayEnd = toMinutes(workingHours.end)
  const floor = Math.max(dayStart, earliestMinutes ?? dayStart)

  const taken = [...busy].sort((a, b) => a.start - b.start)
  const placements: Placement[] = []

  const free = (start: number, minutes: number) =>
    start >= floor &&
    start + minutes <= dayEnd &&
    !taken.some((b) => start < b.end && start + minutes > b.start)

  const put = (item: SchedulableTask, start: number) => {
    placements.push({
      taskId: item.id,
      name: item.name,
      kind: item.kind ?? 'task',
      startTime: fromMinutes(start),
      endTime: fromMinutes(start + item.minutes),
      minutes: item.minutes,
      reason: reasonFor(item),
    })
    taken.push({ start, end: start + item.minutes })
    taken.sort((a, b) => a.start - b.start)
  }

  // Anything with a usual time gets first refusal on it, in time order, so a
  // habit stays where it belongs instead of being shuffled somewhere new each
  // morning. One that no longer fits falls through to be placed like the rest.
  const displaced: SchedulableTask[] = []
  for (const item of tasks.filter((t) => t.preferredStart != null).sort((a, b) => a.preferredStart! - b.preferredStart!)) {
    if (free(item.preferredStart!, item.minutes)) put(item, item.preferredStart!)
    else displaced.push(item)
  }

  // Most overdue first, then higher priority within the same due date — the
  // order someone would pick doing this by hand. An undated item sorts last
  // rather than first, which an empty string would have done.
  const dueKey = (d: string | null) => d ?? '9999-12-31'
  const remaining = [...tasks.filter((t) => t.preferredStart == null), ...displaced].sort((a, b) => {
    const byDate = dueKey(a.dueDate).localeCompare(dueKey(b.dueDate))
    if (byDate !== 0) return byDate
    return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
  })

  let cursor = floor
  for (const item of remaining) {
    let scan = Math.ceil(Math.max(cursor, floor) / SNAP_MINUTES) * SNAP_MINUTES
    let placed = false

    while (scan + item.minutes <= dayEnd) {
      const clash = taken.find((b) => scan < b.end && scan + item.minutes > b.start)
      if (clash) {
        // step past whatever is in the way, back onto a round number
        scan = Math.ceil(clash.end / SNAP_MINUTES) * SNAP_MINUTES
        continue
      }
      put(item, scan)
      cursor = scan + item.minutes + gapMinutes
      placed = true
      break
    }

    // Day is full. Everything after this would be equally unplaceable, and
    // silently dropping half a plan is worse than stopping.
    if (!placed) break
  }

  return placements.sort((a, b) => a.startTime.localeCompare(b.startTime))
}

function reasonFor(task: SchedulableTask): string {
  const parts: string[] = []
  if (task.kind === 'habit') parts.push(task.preferredStart != null ? 'your usual time' : 'daily habit')
  else if (task.priority === 'high') parts.push('high priority')
  parts.push(`${task.minutes} min`)
  return parts.join(' · ')
}
