import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { deleteNode, getEdges, getNodeById } from '@/lib/graph/queries'
import { replanDay } from '@/lib/schedule-day'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { parseTime } from '@/lib/schedule'
import { recordSignal } from '@/lib/availability'

/** Pushed at least this far on, so "later" is not five minutes from now. */
const MIN_PUSH = 30

/**
 * "Later": not now — put it further on today, and let the rest move up.
 *
 * The slot it held is released, whatever its firmness: pressing Later is the
 * user moving it themselves. The day is then replanned with this one thing
 * held back until after the slot it had, so the next thing can move into
 * the time freed. When nothing is left today it simply stays unplanned, and
 * Today's "due" list offers to move it to tomorrow.
 *
 * Body: { targetId, blockId?, tz? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { targetId?: unknown; blockId?: unknown; tz?: unknown }
  if (typeof body.targetId !== 'number') return Response.json({ error: 'targetId is required' }, { status: 400 })
  const target = await getNodeById(user.id, body.targetId)
  if (!target || (target.type !== 'Task' && target.type !== 'Habit')) {
    return Response.json({ error: 'Only a task or a habit can be put off' }, { status: 400 })
  }

  const settings = await readSettings(user.id)
  const clock = clockIn(zoneFor(typeof body.tz === 'string' ? body.tz : null, settings.timeZone))

  let heldUntil = clock.minutes + MIN_PUSH
  /** Where it had been planned — the time it did not happen at. */
  let slotStart: number | null = null
  if (typeof body.blockId === 'number') {
    const block = await getNodeById(user.id, body.blockId)
    const bp = block?.properties as Record<string, unknown> | undefined
    const holds = (await getEdges(user.id, { type: 'scheduled-for', sourceId: body.blockId })).map((e) => e.targetId)
    // Only a one-off block for today holding just this: a routine or a
    // shared session is the user's arrangement and is not taken apart here.
    const own = block?.type === 'TimeBlock' && bp?.date === clock.date &&
      (typeof bp.frequency !== 'string' || bp.frequency === 'once') &&
      holds.length === 1 && holds[0] === target.id
    if (own) {
      const end = parseTime(bp!.endTime)
      if (end !== null) heldUntil = Math.max(heldUntil, end)
      slotStart = parseTime(bp!.startTime)
      await deleteNode(user.id, block!.id)
    }
  }

  // What the learning reads: this did not happen at the time it was given.
  // Recorded as a skip at that time — a 'moved' signal would count as
  // evidence for the new time, which nobody has chosen yet.
  if (slotStart !== null) {
    const name = String((target.properties as Record<string, unknown>).name ?? '')
    await recordSignal(user.id, {
      kind: 'skipped', itemType: target.type, itemId: target.id, name, date: clock.date, minute: slotStart,
    }).catch(() => {})
  }

  const result = await replanDay(user.id, clock.date, clock, new Map([[target.id, heldUntil]]))
  const placed = result.placements.find((p) => p.taskId === target.id)
  return Response.json({ ok: true, movedTo: placed ? { start: placed.startTime, end: placed.endTime } : null, ...result })
}
