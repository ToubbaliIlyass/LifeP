/**
 * Working out when things should happen.
 *
 * Kept pure and free of database access so the same logic can answer two
 * different questions — "what would you suggest?" and "go ahead and do it" —
 * without the two ever drifting apart, and so it can be tested directly.
 */

export const DEFAULT_TASK_MINUTES = 30

export interface SchedulableTask {
  id: number
  name: string
  dueDate: string | null
  priority: string
  minutes: number
}

export interface BusyInterval {
  start: number
  end: number
}

export interface Placement {
  taskId: number
  name: string
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
}: {
  tasks: SchedulableTask[]
  busy: BusyInterval[]
  workingHours: { start: string; end: string }
  /** Floor for the first placement — used to avoid scheduling into hours already gone. */
  earliestMinutes?: number
}): Placement[] {
  const dayStart = toMinutes(workingHours.start)
  const dayEnd = toMinutes(workingHours.end)

  // Most overdue first, then higher priority within the same due date — the
  // order someone would pick doing this by hand.
  const ordered = [...tasks].sort((a, b) => {
    const byDate = (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
    if (byDate !== 0) return byDate
    return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
  })

  const taken = [...busy].sort((a, b) => a.start - b.start)
  const placements: Placement[] = []

  let cursor = Math.max(dayStart, earliestMinutes ?? dayStart)

  for (const task of ordered) {
    let placed = false
    let scan = cursor

    while (!placed && scan + task.minutes <= dayEnd) {
      const end = scan + task.minutes
      const clash = taken.find((b) => scan < b.end && end > b.start)
      if (clash) {
        scan = clash.end // step past whatever is in the way and try again
        continue
      }

      placements.push({
        taskId: task.id,
        name: task.name,
        startTime: fromMinutes(scan),
        endTime: fromMinutes(end),
        minutes: task.minutes,
        reason: reasonFor(task),
      })
      taken.push({ start: scan, end })
      taken.sort((a, b) => a.start - b.start)
      cursor = end
      placed = true
    }

    // Day is full. Everything after this would be equally unplaceable, and
    // silently dropping half a plan is worse than stopping.
    if (!placed) break
  }

  return placements
}

function reasonFor(task: SchedulableTask): string {
  const parts: string[] = []
  if (task.priority === 'high') parts.push('high priority')
  parts.push(`${task.minutes} min`)
  return parts.join(' · ')
}
