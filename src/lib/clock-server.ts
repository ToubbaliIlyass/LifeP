import { clockIn, zoneFor, type UserClock } from '@/lib/clock'
import { readSettings } from '@/lib/settings'

/**
 * The user's clock, for a request that sent the browser's zone (or did not).
 * See src/lib/clock.ts: the server's own clock is UTC once deployed.
 */
export async function clockFor(userId: number, requested: unknown): Promise<UserClock> {
  const s = await readSettings(userId)
  return clockIn(zoneFor(typeof requested === 'string' ? requested : null, s.timeZone, s.timeZoneOverride))
}
