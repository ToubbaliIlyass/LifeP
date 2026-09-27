import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import {
  getNodeById, updateNode, deleteNode, getEdges, createEdge, deleteEdge, findExistingEdge,
} from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'
import { toMinutes } from '@/lib/schedule'
import { blockSource, recordSignal } from '@/lib/availability'
import { tasksByBlock, firmnessOf, type Firmness } from '@/lib/sessions'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const blockId = parseInt(idStr, 10)
  if (isNaN(blockId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await getNodeById(user.id, blockId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json() as {
    startTime?: string; endTime?: string; date?: string
    /** What the session is called, when it holds more than one thing. */
    label?: string | null
    /** Batch another task into this block, or take one out of it. */
    addTask?: number
    removeTask?: number
    /**
     * Turn this block into a routine, or back into a one-off. 'once' clears
     * the recurrence rather than storing it, so nothing has to special-case
     * the word later.
     */
    frequency?: string
    daysOfWeek?: number[]
    /** Accept a planned slot ('hard'), or hand it back to the planner. */
    firmness?: Firmness
  }
  const before = existing.properties as Record<string, unknown>

  /*
   * A block may hold several tasks — "Study" is the two hours, the
   * assignments are what happens in it. Adding one is another `scheduled-for`
   * edge rather than another overlapping block, which is what used to happen
   * and made one afternoon look like three.
   */
  if (typeof body.addTask === 'number') {
    const task = await getNodeById(user.id, body.addTask)
    if (!task) return Response.json({ error: 'No such task' }, { status: 404 })
    if (task.type === 'TimeBlock') {
      return Response.json({ error: 'A block cannot be scheduled into a block' }, { status: 400 })
    }
    if (!await findExistingEdge(user.id, blockId, body.addTask, 'scheduled-for')) {
      await createEdge(user.id, blockId, body.addTask, 'scheduled-for', {})

      /*
       * Who it now shares the block with. This is the only record that says
       * things belong together — every other signal is about one item at a
       * time, so the app could learn that three habits each happen near
       * 08:00 and still never notice they are one routine.
       */
      const together = (tasksByBlock(await getEdges(user.id, { sourceId: blockId, type: 'scheduled-for' })).get(blockId) ?? [])
      if (together.length > 1) {
        const startTime = before.startTime
        const date = before.date
        for (const id of together) {
          const node = await getNodeById(user.id, id)
          if (!node) continue
          const np = node.properties as Record<string, unknown>
          await recordSignal(user.id, {
            kind: 'batched',
            itemType: node.type,
            itemId: id,
            name: typeof np.name === 'string' ? np.name : typeof np.title === 'string' ? np.title : `${node.type} #${id}`,
            date: typeof date === 'string' ? date : todayStr(),
            minute: typeof startTime === 'string' ? toMinutes(startTime) : null,
            withIds: together.filter((o) => o !== id),
          })
        }
      }
    }
  }

  if (typeof body.removeTask === 'number') {
    for (const edge of await getEdges(user.id, { sourceId: blockId, targetId: body.removeTask, type: 'scheduled-for' })) {
      await deleteEdge(user.id, edge.id)
    }
  }

  // The edge operations and the label are handled separately; only the
  // timing fields are merged into the block's own properties.
  const times = {
    ...(body.date !== undefined ? { date: body.date } : {}),
    ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
    ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
  }
  const { label } = body
  const properties: Record<string, unknown> = { ...before, ...times }

  /*
   * Dragging a planned slot somewhere is the user saying "yes, but then".
   * That is a decision about a time, so the block stops being tentative and
   * the next plan leaves it alone — otherwise the app would move it back and
   * the user would have to keep dragging it to the same place.
   */
  if (body.firmness === 'hard' || body.firmness === 'tentative') {
    properties.firmness = body.firmness
  } else if (
    firmnessOf(before) === 'tentative' &&
    (body.startTime !== undefined || body.date !== undefined)
  ) {
    properties.firmness = 'hard'
  }

  if (body.frequency !== undefined) {
    const RECURRENCE = ['daily', 'weekdays', 'weekly']
    if (RECURRENCE.includes(body.frequency)) {
      properties.frequency = body.frequency
      if (Array.isArray(body.daysOfWeek)) properties.daysOfWeek = body.daysOfWeek
    } else {
      delete properties.frequency
      delete properties.daysOfWeek
      delete properties.until
    }
  }
  // An empty label means "no name", not a name that is the empty string.
  if (label !== undefined) {
    if (label === null || !label.trim()) delete properties.label
    else properties.label = label.trim().slice(0, 120)
  }
  const updated = await updateNode(user.id, blockId, properties)

  // Dragging something to a new time is the user saying when it suits them.
  // A resize (end time only) says nothing about that, so it is not recorded.
  const moved =
    (body.startTime !== undefined && body.startTime !== before.startTime) ||
    (body.date !== undefined && body.date !== before.date)
  if (moved) {
    const source = await blockSource(user.id, blockId)
    const startTime = body.startTime ?? before.startTime
    const date = body.date ?? before.date
    if (source && typeof startTime === 'string' && typeof date === 'string') {
      await recordSignal(user.id, { kind: 'moved', itemType: source.type, itemId: source.id, name: source.name, date, minute: toMinutes(startTime) })
    }
  }

  return Response.json({ ok: true, block: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const blockId = parseInt(idStr, 10)
  if (isNaN(blockId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const existing = await getNodeById(user.id, blockId)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  // Removing a planned slot today or later counts (a little) against that
  // time of day. Read before deleting: the edge to the source goes with it.
  const p = existing.properties as Record<string, unknown>
  if (typeof p.date === 'string' && p.date >= todayStr() && typeof p.startTime === 'string') {
    const source = await blockSource(user.id, blockId)
    if (source) {
      await recordSignal(user.id, { kind: 'skipped', itemType: source.type, itemId: source.id, name: source.name, date: p.date, minute: toMinutes(p.startTime) })
    }
  }

  await deleteNode(user.id, blockId)
  return Response.json({ ok: true })
}
