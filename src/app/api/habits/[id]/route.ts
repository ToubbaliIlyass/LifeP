import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, createNode, updateNode, getNodeById } from '@/lib/graph/queries'
import { blockStartFor, forgetDone, recordDone } from '@/lib/availability'
import { clockFor } from '@/lib/clock-server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const habitNodeId = parseInt(idStr, 10)
  if (isNaN(habitNodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json() as { completed: boolean; date?: string; tz?: string }
  const clock = await clockFor(user.id, body.tz)
  const date = body.date ?? clock.date
  const tick = { itemType: 'Habit', itemId: habitNodeId, sourceId: habitNodeId, date }

  if (body.completed) {
    const habit = await getNodeById(user.id, habitNodeId)
    const planned = await blockStartFor(user.id, habitNodeId, date)
    // Ticked today, the clock says when. Back-filling last Tuesday says
    // nothing about the time of day: only its slot, if it had one, as a guess.
    const minute = date === clock.date ? clock.minutes : planned
    if (habit && minute !== null) {
      const hp = habit.properties as Record<string, unknown>
      await recordDone(user.id, {
        ...tick,
        name: typeof hp.name === 'string' ? hp.name : `Habit #${habitNodeId}`,
        minute,
        plannedMinute: planned,
        approximate: date !== clock.date,
      })
    }
  } else {
    await forgetDone(user.id, tick)
  }

  // Find existing HabitLog for this habit + date
  const allLogs = await getNodes(user.id, { type: 'HabitLog' })
  const existing = allLogs.find((n) => {
    const p = n.properties as Record<string, unknown>
    return p.habitNodeId === habitNodeId && p.date === date
  })

  if (existing) {
    const updated = await updateNode(user.id, existing.id, {
      ...(existing.properties as Record<string, unknown>),
      completed: body.completed,
    })
    return Response.json({ ok: true, log: updated })
  }

  const log = await createNode(user.id, 'HabitLog', {
    habitNodeId,
    date,
    completed: body.completed,
  })
  return Response.json({ ok: true, log })
}
