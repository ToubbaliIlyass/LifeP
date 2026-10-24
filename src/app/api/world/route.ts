import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { clockIn, zoneFor } from '@/lib/clock'
import { readSettings } from '@/lib/settings'
import { collectVotes, identityOf, tally, type WorldPayload } from '@/lib/identity'

/**
 * Everything the world is drawn from: the identities, and every vote ever
 * cast for them, oldest first (see src/lib/identity.ts). Read fresh each
 * time from the finished to-dos themselves, so it can never drift from the
 * lists.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const settings = await readSettings(user.id)
  const zone = zoneFor(new URL(request.url).searchParams.get('tz'), settings.timeZone, settings.timeZoneOverride)
  const today = clockIn(zone).date
  const [nodes, edges] = await Promise.all([getNodes(user.id), getEdges(user.id)])

  const identities = nodes.filter((n) => n.type === 'Identity').map(identityOf)
  const votes = collectVotes({ nodes, edges, identities, today, zone })
  const payload: WorldPayload = { today, votes, ...tally(identities, votes) }
  return Response.json(payload)
}
