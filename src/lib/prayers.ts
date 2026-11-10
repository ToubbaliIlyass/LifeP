import { PRAYERS, PRAYER_LABELS, computePrayerTimes, utcOffsetHours, type Prayer } from '@/lib/prayer-times'
import type { Settings } from '@/lib/settings'

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

/*
 * The five are to-dos like any other, with two differences: they repeat every
 * day, and their time is worked out rather than typed.
 *
 * One Task per prayer, kept open for good: `prayer` says which of the five,
 * `doneDates` holds the days it was prayed. That shape is deliberate.
 * The usual way a repeating to-do works (finish it and a new copy is made
 * for the next day) would leave five finished rows a day in the Logbook,
 * and an unticked Fajr would sit on Today as overdue for as long as it was
 * missed. Here a day not prayed leaves nothing behind, and tomorrow starts
 * clean. The time is never stored, since it moves every day: it is read from
 * `prayerTimesFor` when the list is built.
 */

/** The 'prayer' field of a node's properties, when it is one of the five. */
export function prayerKeyOf(props: Record<string, unknown>): Prayer | null {
  const k = props.prayer
  return typeof k === 'string' && (PRAYERS as readonly string[]).includes(k) ? (k as Prayer) : null
}

/** The days a prayer was prayed, as stored. */
export function doneDatesOf(props: Record<string, unknown>): string[] {
  return Array.isArray(props.doneDates) ? props.doneDates.filter((d): d is string => typeof d === 'string') : []
}

/** Days kept: long enough for any "this week" or "last month" a person might look at. */
const KEEP_DAYS = 400

/** `doneDates` with `date` added or taken out, oldest dropped past a year or so. */
export function withPrayerDone(props: Record<string, unknown>, date: string, done: boolean): string[] {
  const days = new Set(doneDatesOf(props))
  if (done) days.add(date)
  else days.delete(date)
  return [...days].sort().slice(-KEEP_DAYS)
}
