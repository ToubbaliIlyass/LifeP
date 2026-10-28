import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { clockFor } from '@/lib/clock-server'
import { skipTask } from '@/lib/skip-server'

const DATE = /^\d{4}-\d{2}-\d{2}$/

const WORDS: Record<string, string> = {
  'not-repeating': 'Only a repeating to-do can be skipped.',
  finished: 'That one is already finished.',
  'no-day': 'It has no day to skip.',
  last: 'That is the last one in the series, so there is nothing to skip to.',
  moved: 'It has already moved on.',
  'nothing-to-undo': 'There is no skip to undo.',
  changed: 'It has changed since, so the skip was left as it is.',
}

/**
 * Skips today's turn of a repeating to-do, or puts it back.
 *
 * Body: { date, tz } to skip — `date` is the day the screen saw it on, so a
 * second click or a second device cannot skip twice — and { undo: true, date }
 * with the day that was skipped to restore it. Nothing is completed, so no
 * rhythm or streak is touched (see src/lib/skip.ts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const date = typeof body.date === 'string' && DATE.test(body.date) ? body.date : undefined
  if (body.date !== undefined && !date) return Response.json({ error: 'Invalid date' }, { status: 400 })
  const undo = body.undo === true
  if (undo && !date) return Response.json({ error: 'date is required to undo' }, { status: 400 })

  // Scoped to the user inside skipTask; someone else's id is simply not found.
  const result = await skipTask(user.id, id, { today: undo ? '' : (await clockFor(user.id, body.tz)).date, date, undo })
  if (!result.ok) {
    if (result.reason === 'not-found') return Response.json({ error: 'Not found' }, { status: 404 })
    const status = result.reason === 'not-repeating' || result.reason === 'no-day' ? 400 : 409
    return Response.json({ error: WORDS[result.reason], reason: result.reason }, { status })
  }
  return Response.json({ ok: true, from: result.from, to: result.to })
}
