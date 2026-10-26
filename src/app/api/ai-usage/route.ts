import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { readUsage } from '@/lib/ai/usage'
import { clockIn, zoneFor } from '@/lib/clock'
import { readSettings } from '@/lib/settings'

/** What the AI has cost so far: lifetime, this month, today. Estimated from token counts (src/lib/ai/cost.ts). */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const settings = await readSettings(user.id)
  const today = clockIn(zoneFor(new URL(request.url).searchParams.get('tz'), settings.timeZone, settings.timeZoneOverride)).date
  return Response.json(await readUsage(user.id, today))
}
