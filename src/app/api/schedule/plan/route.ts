import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { replanDay } from '@/lib/schedule-day'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * "Plan my day" — see replanDay in src/lib/schedule-day.ts, which the
 * assistant's planDay tool shares.
 *
 * Deliberately writes rather than suggests: the user pressed Plan, which is
 * the approval. Nothing hard is ever touched.
 *
 * Body: { date?, tz? } — `tz` is the browser's zone, so "today" and "now"
 * are the user's and not the server's (see src/lib/clock.ts).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { date?: string; tz?: string }
  const settings = await readSettings(user.id)
  const clock = clockIn(zoneFor(body.tz, settings.timeZone))
  const date = typeof body.date === 'string' && DATE.test(body.date) ? body.date : clock.date
  if (date < clock.date) {
    return Response.json({ error: 'A day that has already gone cannot be planned' }, { status: 400 })
  }

  const result = await replanDay(user.id, date, clock)
  return Response.json({ ok: true, ...result, scheduled: result.placements.length })
}
