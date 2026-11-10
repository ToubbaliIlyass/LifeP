import { getEdges, getNodes } from '@/lib/graph/queries'
import { clockIn, zoneFor } from '@/lib/clock'
import { readSettings } from '@/lib/settings'
import { collectEvidence, identityOf, tally, type WorldPayload } from '@/lib/identity'

/** Everything about who the user is becoming, read fresh from the finished to-dos: counts, receipts and what is next. */
export async function worldPayload(userId: number, tz: string | null): Promise<WorldPayload> {
  const settings = await readSettings(userId)
  const zone = zoneFor(tz, settings.timeZone, settings.timeZoneOverride)
  const today = clockIn(zone).date
  const [nodes, edges] = await Promise.all([getNodes(userId), getEdges(userId)])
  const identities = nodes.filter((n) => n.type === 'Identity').map(identityOf)
  const evidence = collectEvidence({ nodes, edges, identities, today, zone })
  return { today, votes: evidence.votes, ...tally(identities, evidence.votes, evidence) }
}
