import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createEdge, createNode, getEdges, getNodeById, getNodes } from '@/lib/graph/queries'
import { loadAvailability } from '@/lib/availability'
import { DEFAULT_HABIT_MINUTES, DEFAULT_TASK_MINUTES, fromMinutes, toMinutes } from '@/lib/schedule'
import { displayName } from '@/lib/graph/naming'
import { todayStr } from '@/lib/date'

/**
 * Routines the user has already built by hand, without calling them that.
 *
 * Doing the same three things in one block, morning after morning, is a
 * routine — but it had to be rebuilt every single day, because nothing ever
 * said "this again?". The pattern was already being noticed: `groupings()`
 * counts what gets batched together and reports anything seen three times or
 * more (src/lib/availability.ts). It just had nowhere to go except a line of
 * text in the assistant's context, where it depended on the user happening to
 * ask the right question.
 *
 * So: offered here, made in one click by POST. Nothing is created without
 * that click — a background job that invents recurring blocks would be the
 * old habit-stamping bug wearing a hat.
 */

/** A grouping stops being an offer once its members already share a routine. */
async function existingRoutineFor(userId: number, ids: number[]): Promise<boolean> {
  const blocks = await getNodes(userId, { type: 'TimeBlock' })
  const recurring = blocks.filter((b) => {
    const p = b.properties as Record<string, unknown>
    return typeof p.frequency === 'string' && p.frequency !== 'once'
  })
  if (recurring.length === 0) return false

  const edges = await getEdges(userId, { type: 'scheduled-for' })
  const wanted = new Set(ids)
  for (const block of recurring) {
    const held = edges.filter((e) => e.sourceId === block.id).map((e) => e.targetId)
    // Already a routine if it holds most of the group — an exact match would
    // keep offering the same three things because one block has a fourth.
    const shared = held.filter((id) => wanted.has(id)).length
    if (shared >= Math.min(2, wanted.size) && shared >= wanted.size - 1) return true
  }
  return false
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const availability = await loadAvailability(user.id)
  const offers = []

  for (const group of availability.groupings()) {
    // Only what still exists: a grouping is built from old signals, and the
    // things in it may since have been deleted.
    const items = []
    for (const id of group.ids) {
      const node = await getNodeById(user.id, id)
      if (node && (node.type === 'Habit' || node.type === 'Task')) {
        items.push({ id, type: node.type, name: displayName(node.type, node.properties as Record<string, unknown>) })
      }
    }
    if (items.length < 2) continue
    if (await existingRoutineFor(user.id, items.map((i) => i.id))) continue

    offers.push({
      ids: items.map((i) => i.id),
      items,
      times: group.times,
      startTime: group.usualStart !== null ? fromMinutes(group.usualStart) : null,
    })
  }

  return Response.json({ offers })
}

/**
 * Make the routine: one recurring block holding all of them.
 *
 * Written straight in rather than proposed, because the user pressed the
 * button — and a routine is as easy to delete as it was to make.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as {
    ids?: number[]
    label?: string
    startTime?: string
    frequency?: string
    daysOfWeek?: number[]
  }
  const ids = (body.ids ?? []).filter((id) => Number.isInteger(id))
  if (ids.length < 2) {
    return Response.json({ error: 'A routine needs at least two things in it' }, { status: 400 })
  }
  if (!body.startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime)) {
    return Response.json({ error: 'startTime must be HH:MM' }, { status: 400 })
  }

  const RECURRENCE = ['daily', 'weekdays', 'weekly']
  const frequency = RECURRENCE.includes(body.frequency ?? '') ? body.frequency! : 'daily'

  // Long enough to hold everything in it, using each item's own length.
  let minutes = 0
  const members = []
  for (const id of ids) {
    const node = await getNodeById(user.id, id)
    if (!node || (node.type !== 'Habit' && node.type !== 'Task')) continue
    const p = node.properties as Record<string, unknown>
    minutes +=
      typeof p.durationMinutes === 'number' && p.durationMinutes > 0 ? p.durationMinutes
        : typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0 ? p.estimatedMinutes
        : node.type === 'Habit' ? DEFAULT_HABIT_MINUTES
        : DEFAULT_TASK_MINUTES
    members.push(node)
  }
  if (members.length < 2) {
    return Response.json({ error: 'Those things no longer exist' }, { status: 404 })
  }

  const start = toMinutes(body.startTime)
  const block = await createNode(user.id, 'TimeBlock', {
    date: todayStr(),
    startTime: body.startTime,
    endTime: fromMinutes(Math.min(24 * 60 - 1, start + minutes)),
    label: body.label?.trim()?.slice(0, 120) || 'Routine',
    frequency,
    ...(frequency === 'weekly'
      ? { daysOfWeek: body.daysOfWeek?.length ? body.daysOfWeek : [new Date().getDay()] }
      : {}),
    // A routine the user asked for is a commitment, not a suggestion: the
    // planner must work around it rather than reshuffle it every morning.
    firmness: 'hard',
  })
  for (const member of members) {
    await createEdge(user.id, block.id, member.id, 'scheduled-for', {})
  }

  return Response.json({ ok: true, blockId: block.id, count: members.length })
}
