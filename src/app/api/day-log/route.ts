import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { todayStr } from '@/lib/date'
import { deleteLogEntry, readDayLog } from '@/lib/day-log'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** One day, planned against what actually happened. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const date = new URL(request.url).searchParams.get('date')
  return Response.json(await readDayLog(user.id, date && DATE.test(date) ? date : todayStr()))
}

/**
 * Takes back something the assistant logged. Logging is silent, which is only
 * acceptable because anything it got wrong — a misheard time, the wrong
 * habit — can be seen here and removed.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const removed = await deleteLogEntry(user.id, id)
  return removed
    ? Response.json({ ok: true })
    : Response.json({ error: 'Only entries you told the assistant about can be removed' }, { status: 404 })
}
