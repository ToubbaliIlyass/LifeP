import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { isEventStatus } from '@/lib/event-status'
import { resolveEvent } from '@/lib/event-status-server'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Settles one day of an event: { date, status: 'attended' | 'cancelled' | 'missed' },
 * or { date, status: null } to put it back (Undo). Only that day changes, even
 * for a repeating event (see src/lib/event-status.ts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.date !== 'string' || !DATE.test(body.date)) return Response.json({ error: 'A day is needed' }, { status: 400 })
  if (body.status !== null && !isEventStatus(body.status)) return Response.json({ error: 'Invalid status' }, { status: 400 })

  const r = await resolveEvent(user.id, id, body.date, body.status as never)
  if (!r.ok) return Response.json({ error: r.reason === 'not-found' ? 'Not found' : 'That event is not on that day' }, { status: r.reason === 'not-found' ? 404 : 400 })
  return Response.json({ ok: true, date: r.date, status: r.status })
}
