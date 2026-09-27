import { PRAYERS, PRAYER_LABELS, computePrayerTimes, utcOffsetHours, type Prayer } from '@/lib/prayer-times'
import type { Settings } from '@/lib/settings'
import type { Node } from '@/lib/db/schema'

/** Long enough to pray without the slot pretending to own the hour. */
export const PRAYER_MINUTES = 15

export interface PrayerTime {
  key: Prayer
  label: string
  /** HH:MM local. */
  time: string
}

/**
 * The day's five, when the feature is on and a location is known — or none.
 *
 * One place for it, because two things need the same answer: the Now queue
 * shows them as things to do, and the planner keeps them free. The planner
 * used to know nothing about them, and would book a task straight over asr.
 */
export function prayerTimesFor(
  settings: Pick<Settings, 'prayer' | 'weather'>,
  date: string,
  zone: string | null,
): PrayerTime[] {
  const { prayer, weather } = settings
  if (!prayer?.enabled || weather?.lat == null || weather?.lon == null) return []
  /*
   * Computed rather than fetched. The obvious alternative, Aladhan's API,
   * carries a stale DST rule for Morocco: it moves the clock back an hour in
   * late October, which the country stopped doing in 2018, so its winter
   * times are an hour early. Checked against the tz database and against the
   * sun's actual position, this agrees to the minute all year.
   */
  const times = computePrayerTimes({
    latitude: weather.lat,
    longitude: weather.lon,
    date,
    utcOffsetHours: zone ? utcOffsetHours(zone, date) : 0,
    method: prayer.method,
    madhab: prayer.madhab,
  })
  return PRAYERS
    .map((key) => ({ key, label: PRAYER_LABELS[key], time: times[key] }))
    // A time only fails to resolve above the polar circles, where the sun
    // may never reach the angle at all.
    .filter((p) => p.time !== '--:--')
}

/**
 * The Habit the five tick off: the one remembered in settings, or else the
 * one whose name says prayer. Pure, so Today and ticking a prayer agree on
 * it — Today used to know it only after the first prayer was ticked, and
 * listed "Pray five prayers" beside the five prayers themselves until then.
 */
export function findPrayerHabit(habits: Node[], stored: number | null): number | null {
  if (stored !== null && habits.some((h) => h.id === stored)) return stored
  const found = habits.find((h) => {
    const p = h.properties as Record<string, unknown>
    return typeof p.name === 'string' && /\bpray(er|ers|ing)?\b|salah|salat/i.test(p.name)
  })
  return found?.id ?? null
}
