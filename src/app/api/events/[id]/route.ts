import { applyReminderChanges } from '@/lib/reminders'
import { nowFor } from '@/lib/reminders-server'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { deleteNode, getNodeById, updateNode } from '@/lib/graph/queries'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const FREQUENCIES = new Set(['once', 'daily', 'weekdays', 'weekly'])

async function event(request: Request, params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: unauthorized() }
  const id = parseInt((await params).id, 10)
  const node = Number.isNaN(id) ? undefined : await getNodeById(user.id, id)
  if (!node || node.type !== 'Event') return { error: Response.json({ error: 'Not found' }, { status: 404 }) }
  return { user, node }
}

/**
 * Changes an event, in the editor's words: { name, date, time, duration,
 * location, frequency, daysOfWeek, until }. Only what is sent is touched; an empty
 * time or place takes it away.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await event(request, params)
  if ('error' in found) return found.error
  const { user, node } = found
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const p = { ...(node.properties as Record<string, unknown>) }

  if (typeof body.name === 'string' && body.name.trim()) p.name = body.name.trim().slice(0, 200)
  if (typeof body.date === 'string' && DATE.test(body.date)) p.date = body.date
  if ('time' in body) {
    if (typeof body.time === 'string' && TIME.test(body.time)) p.time = body.time
    else delete p.time
  }
  if (typeof body.duration === 'number' && body.duration > 0) p.duration = Math.min(Math.round(body.duration), 24 * 60)
  if ('location' in body) {
    if (typeof body.location === 'string' && body.location.trim()) p.location = body.location.trim()
    else delete p.location
  }
  if (typeof body.frequency === 'string' && FREQUENCIES.has(body.frequency)) {
    p.frequency = body.frequency
    const days = Array.isArray(body.daysOfWeek) ? body.daysOfWeek.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : []
    if (body.frequency === 'weekly') p.daysOfWeek = days.length ? days : [new Date(String(p.date) + 'T00:00:00').getDay()]
    else if (body.frequency === 'weekdays') p.daysOfWeek = [1, 2, 3, 4, 5]
    else delete p.daysOfWeek
    if (body.frequency === 'once') delete p.until
  }
  // The last day a repeating one is on; an empty one takes it away.
  if ('until' in body && p.frequency !== 'once') {
    if (typeof body.until === 'string' && DATE.test(body.until)) p.until = body.until
    else delete p.until
  }

  // When it reminds you: at a time on each day it is on, or before it starts.
  applyReminderChanges(p, body, await nowFor(user.id, body))

  await updateNode(user.id, node.id, p)
  return Response.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await event(request, params)
  if ('error' in found) return found.error
  await deleteNode(found.user.id, found.node.id)
  return Response.json({ ok: true })
}
