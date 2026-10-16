import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode } from '@/lib/graph/queries'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const FREQUENCIES = new Set(['once', 'daily', 'weekdays', 'weekly'])

/**
 * Something you show up to: a class, an appointment, a shift.
 *
 * Not a to-do — nothing to tick — but the planner treats it as busy time and
 * Today and Upcoming show it above the day's list. Made by hand here, so it
 * is written straight away; the assistant's are queued only when they repeat.
 *
 * Body: { name, date, time?, duration?, location?, frequency?, daysOfWeek?, until? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  const date = typeof body.date === 'string' && DATE.test(body.date) ? body.date : null
  if (!name || !date) return Response.json({ error: 'An event needs a name and a day' }, { status: 400 })

  const frequency = typeof body.frequency === 'string' && FREQUENCIES.has(body.frequency) ? body.frequency : 'once'
  const days = Array.isArray(body.daysOfWeek) ? body.daysOfWeek.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : []
  const node = await createNode(user.id, 'Event', {
    name,
    date,
    ...(typeof body.time === 'string' && TIME.test(body.time) ? { time: body.time } : {}),
    duration: typeof body.duration === 'number' && body.duration > 0 ? Math.min(Math.round(body.duration), 24 * 60) : 60,
    ...(typeof body.location === 'string' && body.location.trim() ? { location: body.location.trim() } : {}),
    frequency,
    // A weekly event with no day picked happens on the day it starts.
    ...(frequency === 'weekly' ? { daysOfWeek: days.length ? days : [new Date(date + 'T00:00:00').getDay()] } : {}),
    ...(frequency === 'weekdays' ? { daysOfWeek: [1, 2, 3, 4, 5] } : {}),
    ...(frequency !== 'once' && typeof body.until === 'string' && DATE.test(body.until) ? { until: body.until } : {}),
  })
  return Response.json({ ok: true, id: node.id })
}
