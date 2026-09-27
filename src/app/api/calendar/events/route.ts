import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode } from '@/lib/graph/queries'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * An event the user put on the calendar themselves — a dentist appointment,
 * a friend's birthday — rather than a task or habit being scheduled.
 *
 * The user's own action, so it is written directly with no proposal, the same
 * as quick-add. Linking it to goals or courses is a separate, optional step
 * (./[id]/links) that the assistant proposes and the user approves.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json()) as {
    name?: unknown; date?: unknown; time?: unknown; duration?: unknown; location?: unknown
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return Response.json({ error: 'Give the event a name' }, { status: 400 })
  if (typeof body.date !== 'string' || !DATE.test(body.date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  const timed = typeof body.time === 'string' && TIME.test(body.time)

  const node = await createNode(user.id, 'Event', {
    name: name.slice(0, 200),
    date: body.date,
    frequency: 'once',
    // No time means all-day: it sits in the calendar's all-day row.
    ...(timed
      ? { time: body.time, duration: typeof body.duration === 'number' && body.duration > 0 ? Math.round(body.duration) : 60 }
      : {}),
    ...(typeof body.location === 'string' && body.location.trim() ? { location: body.location.trim() } : {}),
  })

  return Response.json({ ok: true, id: node.id })
}
