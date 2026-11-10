import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { matchIdentities } from '@/lib/identity-match'

/** What would count toward these identities, read from the user's own lists. Writes nothing. Body: { names: string[] } */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json().catch(() => ({}))) as { names?: unknown }
  const names = Array.isArray(body.names) ? body.names.filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 80)) : []
  if (!names.length) return Response.json({ matches: [] })
  const settings = await readSettings(user.id)
  const date = clockIn(zoneFor(null, settings.timeZone, settings.timeZoneOverride)).date
  return Response.json({ matches: await matchIdentities(user.id, names, date) })
}
