import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'
import { planDay } from '@/lib/schedule-day'
import { DEFAULT_DAY } from '@/lib/schedule'

/**
 * What the app would put on the calendar today, without putting it there.
 *
 * Purely a dry run: nothing is written, so this can be called on every visit
 * to the dashboard and the user still decides whether any of it happens.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? todayStr()

  const settingsNodes = await getNodes(user.id, { type: 'Settings' })
  const settings = (settingsNodes[0]?.properties ?? {}) as {
    scheduleMode?: 'off' | 'suggest' | 'auto'
    workingHours?: { start: string; end: string }
  }

  const mode = settings.scheduleMode ?? 'off'
  if (mode !== 'suggest') return Response.json({ date, mode, suggestions: [] })

  const suggestions = await planDay(
    user.id,
    date,
    settings.workingHours ?? DEFAULT_DAY,
  )

  return Response.json({ date, mode, suggestions })
}
