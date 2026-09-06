import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges, getNodeById, createNode, createEdge } from '@/lib/graph/queries'
import type { Node } from '@/lib/db/schema'
import { todayStr, isDueOn, eventOccursOn } from '@/lib/date'
import { planDay } from '@/lib/schedule-day'
import { toMinutes, fromMinutes, type BusyInterval } from '@/lib/schedule'

/**
 * Habits shouldn't need to be dragged onto the calendar by hand every
 * single day — whenever a day's schedule is requested, any habit due that
 * day (per its own frequency/daysOfWeek — a weekly habit only ever gets
 * filled on the days it's actually set for) that isn't already on the
 * calendar and isn't already marked done gets a default slot
 * automatically, reusing whatever time it was last scheduled at (or a
 * generic morning default the first time a time hasn't been set yet).
 * Scoped to today-or-later only (the caller enforces this) — a past day
 * is never rewritten with a fabricated entry it didn't actually get.
 */
async function autoFillHabitsForDate(userId: number, date: string, dayStart: string) {
  const dow = new Date(date + 'T00:00:00').getDay()
  const habits = await getNodes(userId, { type: 'Habit' })
  if (habits.length === 0) return

  const habitLogs = await getNodes(userId, { type: 'HabitLog' })
  const scheduledForEdges = await getEdges(userId, { type: 'scheduled-for' })
  const timeBlocks = await getNodes(userId, { type: 'TimeBlock' })
  const blockById = new Map(timeBlocks.map((b) => [b.id, b]))

  // Everything already occupying this day, so auto-filled habits land in gaps
  // rather than on top of each other. Previously every habit without a
  // remembered time was given the same hardcoded 08:00, so a person with four
  // habits got four blocks stacked on one slot.
  const taken: BusyInterval[] = []
  for (const block of timeBlocks) {
    const bp = block.properties as Record<string, unknown>
    if (bp.date !== date) continue
    if (typeof bp.startTime === 'string' && typeof bp.endTime === 'string') {
      taken.push({ start: toMinutes(bp.startTime), end: toMinutes(bp.endTime) })
    }
  }
  for (const event of await getNodes(userId, { type: 'Event' })) {
    const ep = event.properties as Record<string, unknown>
    if (typeof ep.time !== 'string') continue
    const occurs = eventOccursOn(
      {
        date: typeof ep.date === 'string' ? ep.date : null,
        frequency: typeof ep.frequency === 'string' ? ep.frequency : null,
        daysOfWeek: Array.isArray(ep.daysOfWeek) ? (ep.daysOfWeek as number[]) : null,
        until: typeof ep.until === 'string' ? ep.until : null,
      },
      date,
    )
    if (!occurs) continue
    const start = toMinutes(ep.time)
    taken.push({ start, end: start + (typeof ep.duration === 'number' ? ep.duration : 60) })
  }

  // First slot at or after `from` that nothing else already occupies.
  function firstFreeFrom(from: number, minutes: number): number {
    let scan = from
    for (let guard = 0; guard < 200; guard++) {
      const end = scan + minutes
      const clash = taken.find((b) => scan < b.end && end > b.start)
      if (!clash) return scan
      scan = clash.end
    }
    return scan
  }

  for (const habit of habits) {
    const p = habit.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    if (!isDueOn(frequency, daysOfWeek, dow)) continue

    // Any log for today — completed or not — means the user has already
    // made a decision about this occurrence (marked it done, or removed
    // its auto-filled slot from the calendar) and it shouldn't be
    // re-added out from under them.
    const hasLogToday = habitLogs.some((n) => {
      const lp = n.properties as Record<string, unknown>
      return lp.habitNodeId === habit.id && lp.date === date
    })
    if (hasLogToday) continue

    const blocksForHabit = scheduledForEdges
      .filter((e) => e.targetId === habit.id)
      .map((e) => blockById.get(e.sourceId))
      .filter((b): b is Node => b !== undefined)

    const alreadyScheduledToday = blocksForHabit.some(
      (b) => (b.properties as Record<string, unknown>).date === date,
    )
    if (alreadyScheduledToday) continue

    // Reuse the most recent prior slot's time-of-day, else a generic default.
    const mostRecent = blocksForHabit
      .map((b) => b.properties as Record<string, unknown>)
      .filter((bp) => typeof bp.date === 'string' && (bp.date as string) < date)
      .sort((a, b) => (b.date as string).localeCompare(a.date as string))[0]

    const durationMinutes = typeof p.durationMinutes === 'number' ? p.durationMinutes : 30

    // A habit keeps the time of day it was last given — that is the habit.
    // Only when the remembered slot is taken, or there is no remembered slot
    // at all, does it get moved to the next free gap.
    const remembered =
      typeof mostRecent?.startTime === 'string' ? toMinutes(mostRecent.startTime as string) : null
    const rememberedLength =
      typeof mostRecent?.startTime === 'string' && typeof mostRecent?.endTime === 'string'
        ? toMinutes(mostRecent.endTime as string) - toMinutes(mostRecent.startTime as string)
        : durationMinutes
    const length = rememberedLength > 0 ? rememberedLength : durationMinutes

    const startMinutes = firstFreeFrom(remembered ?? toMinutes(dayStart), length)
    const startTime = fromMinutes(startMinutes)
    const endTime = fromMinutes(startMinutes + length)
    taken.push({ start: startMinutes, end: startMinutes + length })

    const block = await createNode(userId, 'TimeBlock', { date, startTime, endTime })
    await createEdge(userId, block.id, habit.id, 'scheduled-for', {})
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? todayStr()

  // Today or any future day — never a past one, so browsing history never
  // fabricates an entry that wasn't actually there.
  if (date >= todayStr()) {
    const settingsNodes = await getNodes(user.id, { type: 'Settings' })
    const settings = (settingsNodes[0]?.properties ?? {}) as {
      scheduleMode?: 'off' | 'suggest' | 'auto'
      workingHours?: { start: string; end: string }
    }
    const hours = settings.workingHours ?? { start: '09:00', end: '18:00' }

    await autoFillHabitsForDate(user.id, date, hours.start)

    // Only "auto" writes without asking. In "suggest" mode the same plan is
    // computed on the dashboard instead and waits for approval, which is why
    // both paths go through planDay rather than each having their own idea of
    // what a good schedule looks like.
    if (settings.scheduleMode === 'auto') {
      const placements = await planDay(user.id, date, hours)
      for (const p of placements) {
        const block = await createNode(user.id, 'TimeBlock', {
          date,
          startTime: p.startTime,
          endTime: p.endTime,
          autoScheduled: true,
        })
        await createEdge(user.id, block.id, p.taskId, 'scheduled-for', {})
      }
    }
  }

  // TimeBlocks for the requested date
  const allBlocks = (await getNodes(user.id, { type: 'TimeBlock' })).filter((n) => {
    const p = n.properties as Record<string, unknown>
    return p.date === date
  })

  // Find scheduled-for edges where source is one of our blocks
  const blockIds = new Set(allBlocks.map((b) => b.id))
  const scheduledEdges = (await getEdges(user.id, { type: 'scheduled-for' })).filter((e) =>
    blockIds.has(e.sourceId),
  )

  // Build sourceNodeId lookup: blockId -> sourceNodeId
  const sourceByBlock = new Map<number, number>()
  for (const edge of scheduledEdges) {
    sourceByBlock.set(edge.sourceId, edge.targetId)
  }

  // Fetch source nodes
  const sourceNodeIds = new Set(sourceByBlock.values())
  const sourceNodes = new Map<number, { id: number; type: string; name: string }>()
  for (const id of sourceNodeIds) {
    const node = await getNodeById(user.id, id)
    if (node) {
      const p = node.properties as Record<string, unknown>
      sourceNodes.set(id, {
        id: node.id,
        type: node.type,
        name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${node.type} #${node.id}`,
      })
    }
  }

  const blocks = allBlocks.map((n) => {
    const p = n.properties as Record<string, unknown>
    const sourceNodeId = sourceByBlock.get(n.id)
    return {
      id: n.id,
      startTime: typeof p.startTime === 'string' ? p.startTime : '00:00',
      endTime: typeof p.endTime === 'string' ? p.endTime : '01:00',
      source: sourceNodeId ? sourceNodes.get(sourceNodeId) ?? null : null,
    }
  }).sort((a, b) => a.startTime.localeCompare(b.startTime))

  // Events for the requested date
  const events = (await getNodes(user.id, { type: 'Event' }))
    .filter((n) => {
      const p = n.properties as Record<string, unknown>
      return eventOccursOn(
        {
          date: typeof p.date === 'string' ? p.date : null,
          frequency: typeof p.frequency === 'string' ? p.frequency : null,
          daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
          until: typeof p.until === 'string' ? p.until : null,
        },
        date,
      )
    })
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        name: typeof p.name === 'string' ? p.name : `Event #${n.id}`,
        // The occurrence, not the rule's start date — this is the day being shown.
        date,
        time: typeof p.time === 'string' ? p.time : null,
        duration: typeof p.duration === 'number' ? p.duration : null,
        location: typeof p.location === 'string' ? p.location : null,
        recurring: typeof p.frequency === 'string' && p.frequency !== 'once' && p.frequency !== 'none',
      }
    })
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  return Response.json({ date, blocks, events })
}
