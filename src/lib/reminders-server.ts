import { momentIn, zoneFor } from '@/lib/clock'
import { readSettings } from '@/lib/settings'

/**
 * The user's "now", for a request that snoozes by minutes — read only when
 * the request needs it, so an ordinary edit costs no settings lookup.
 */
export async function nowFor(userId: number, body: Record<string, unknown>): Promise<string | undefined> {
  if (typeof body.snoozeMinutes !== 'number') return undefined
  const s = await readSettings(userId)
  return momentIn(zoneFor(null, s.timeZone, s.timeZoneOverride))
}
