import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges, createNode, createEdge, deleteNode } from '@/lib/graph/queries'
import { todayStr, addDays } from '@/lib/date'
import { planDay } from '@/lib/schedule-day'
import { DEFAULT_DAY } from '@/lib/schedule'

/**
 * Lay every habit out again, across several days, in one go.
 *
 * Habits were previously written onto each day the moment it was opened, all
 * at the same hardcoded time, which left days stacked with overlapping blocks.
 * Fixing that day by day is not worth anyone's afternoon — and once a day
 * already has habit blocks, the planner leaves it alone, so a bad layout would
 * otherwise stay bad forever.
 *
 * This clears the existing habit blocks over the window and re-places them
 * with the current planner, spread through the working day. Only blocks linked
 * to a Habit are touched: tasks, events and anything placed by hand are left
 * exactly where they are.
 *
 * Deliberately writes rather than suggests. Suggestions exist so the app does
 * not schedule *unprompted* — here the user pressed the button, which is the
 * approval.
 */
const MAX_DAYS = 30

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { days?: number; from?: string }
  const days = Math.min(MAX_DAYS, Math.max(1, Math.floor(body.days ?? 7)))
  const start = body.from ?? todayStr()

  const settingsNodes = await getNodes(user.id, { type: 'Settings' })
  const settings = (settingsNodes[0]?.properties ?? {}) as {
    workingHours?: { start: string; end: string }
  }
  const hours = settings.workingHours ?? DEFAULT_DAY

  const habitIds = new Set((await getNodes(user.id, { type: 'Habit' })).map((h) => h.id))
  if (habitIds.size === 0) {
    return Response.json({ ok: true, cleared: 0, scheduled: 0, days: 0 })
  }

  const dates = Array.from({ length: days }, (_, i) => addDays(start, i))
  const dateSet = new Set(dates)

  // Everything currently holding a habit inside the window.
  const blocks = await getNodes(user.id, { type: 'TimeBlock' })
  const blockById = new Map(blocks.map((b) => [b.id, b]))
  const scheduledEdges = await getEdges(user.id, { type: 'scheduled-for' })

  const staleBlockIds: number[] = []
  for (const edge of scheduledEdges) {
    if (!habitIds.has(edge.targetId)) continue
    const block = blockById.get(edge.sourceId)
    if (!block) continue
    const date = (block.properties as Record<string, unknown>).date
    if (typeof date === 'string' && dateSet.has(date)) staleBlockIds.push(block.id)
  }

  // Deleting the block removes its scheduled-for edge by cascade.
  for (const id of staleBlockIds) await deleteNode(user.id, id)

  let scheduled = 0
  for (const date of dates) {
    // Planned per day, after the clear, so each day sees the space it really
    // has — including its own events and any task blocks left in place.
    const placements = await planDay(user.id, date, hours, 'habits')
    for (const p of placements) {
      const block = await createNode(user.id, 'TimeBlock', {
        date,
        startTime: p.startTime,
        endTime: p.endTime,
        autoScheduled: true,
      })
      await createEdge(user.id, block.id, p.taskId, 'scheduled-for', {})
      scheduled++
    }
  }

  return Response.json({ ok: true, cleared: staleBlockIds.length, scheduled, days: dates.length })
}
