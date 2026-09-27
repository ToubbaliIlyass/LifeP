/**
 * Prayer times from the sun's position.
 *
 * The offline half of the feature: no network, no rate limit, and instant,
 * so the Now timeline never waits on anything to draw. The online half
 * (src/lib/prayer-source.ts) prefers the published Moroccan times when it can
 * reach them, because those are what the mosques actually follow; this is
 * what answers when it cannot.
 *
 * The algorithm is the standard one — solar declination and the equation of
 * time, then the hour angle at which the sun sits at each prayer's defining
 * altitude. Two conventions decide the answers and neither is a detail:
 *
 *   angles  Fajr and Isha are twilight, and how dark counts as twilight
 *           differs by method — 18° and 17° for the Muslim World League,
 *           19° and 17° for Morocco, and so on.
 *   madhab  Asr is when a shadow reaches a multiple of an object's height.
 *           One for most, two for the Hanafi school. That is about an hour.
 *
 * Getting these wrong is not a rendering bug, so the defaults are explicit
 * and the method is the user's to choose.
 */

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
export type Prayer = (typeof PRAYERS)[number]

export const PRAYER_LABELS: Record<Prayer, string> = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
}

export interface Method {
  id: string
  label: string
  /** Sun depression below the horizon at Fajr, in degrees. */
  fajr: number
  /** Either a depression angle for Isha, or minutes after Maghrib. */
  isha: number | { minutesAfterMaghrib: number }
  /**
   * Whole minutes added to a computed time, where the convention is not
   * astronomical. Morocco's official tables carry five precautionary minutes
   * on Dhuhr and Maghrib, which no sun angle will ever produce.
   */
  adjust?: Partial<Record<Prayer, number>>
  /** Aladhan's id for the same convention, so both halves agree. */
  aladhan: number
}

export const METHODS: Method[] = [
  { id: 'morocco', label: 'Morocco (Habous)', fajr: 19, isha: 17, adjust: { dhuhr: 5, maghrib: 5 }, aladhan: 21 },
  { id: 'mwl', label: 'Muslim World League', fajr: 18, isha: 17, aladhan: 3 },
  { id: 'isna', label: 'ISNA (North America)', fajr: 15, isha: 15, aladhan: 2 },
  { id: 'egypt', label: 'Egyptian General Authority', fajr: 19.5, isha: 17.5, aladhan: 5 },
  { id: 'makkah', label: 'Umm al-Qura (Makkah)', fajr: 18.5, isha: { minutesAfterMaghrib: 90 }, aladhan: 4 },
  { id: 'karachi', label: 'Karachi', fajr: 18, isha: 18, aladhan: 1 },
  { id: 'turkey', label: 'Diyanet (Turkey)', fajr: 18, isha: 17, aladhan: 13 },
]

export type Madhab = 'standard' | 'hanafi'

export const methodById = (id: string): Method => METHODS.find((m) => m.id === id) ?? METHODS[0]

// ── trigonometry in degrees, which is how the formulae are written ──
const dsin = (d: number) => Math.sin((d * Math.PI) / 180)
const dcos = (d: number) => Math.cos((d * Math.PI) / 180)
const dtan = (d: number) => Math.tan((d * Math.PI) / 180)
const darcsin = (x: number) => (Math.asin(x) * 180) / Math.PI
const darccos = (x: number) => (Math.acos(x) * 180) / Math.PI
const darctan2 = (y: number, x: number) => (Math.atan2(y, x) * 180) / Math.PI
const darccot = (x: number) => (Math.atan2(1, x) * 180) / Math.PI

const wrap = (value: number, range: number) => {
  const v = value - range * Math.floor(value / range)
  return v < 0 ? v + range : v
}
const fixAngle = (a: number) => wrap(a, 360)
const fixHour = (h: number) => wrap(h, 24)

/** Julian day for a civil date at 00:00 UT. */
function julian(year: number, month: number, day: number): number {
  let y = year
  let m = month
  if (m <= 2) { y -= 1; m += 12 }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5
}

/** Declination of the sun and the equation of time, for a Julian day. */
function sunPosition(jd: number): { declination: number; equationOfTime: number } {
  const d = jd - 2451545.0
  const meanAnomaly = fixAngle(357.529 + 0.98560028 * d)
  const meanLongitude = fixAngle(280.459 + 0.98564736 * d)
  const eclipticLongitude = fixAngle(
    meanLongitude + 1.915 * dsin(meanAnomaly) + 0.020 * dsin(2 * meanAnomaly),
  )
  const obliquity = 23.439 - 0.00000036 * d
  const rightAscension = fixHour(darctan2(dcos(obliquity) * dsin(eclipticLongitude), dcos(eclipticLongitude)) / 15)
  return {
    declination: darcsin(dsin(obliquity) * dsin(eclipticLongitude)),
    equationOfTime: meanLongitude / 15 - rightAscension,
  }
}

export interface PrayerInput {
  latitude: number
  longitude: number
  /** YYYY-MM-DD, the local calendar date. */
  date: string
  /** Offset from UTC in hours for that date, DST included. */
  utcOffsetHours: number
  method?: string
  madhab?: Madhab
}

/**
 * The five times, plus sunrise, as HH:MM local.
 *
 * Each is solved by iteration: the sun's position depends on the time of day
 * being solved for, so the first pass uses a rough guess and two more passes
 * settle it to well under a minute.
 */
export function computePrayerTimes(input: PrayerInput): Record<Prayer | 'sunrise', string> {
  const { latitude: lat, longitude: lng, date, utcOffsetHours: tz } = input
  const method = methodById(input.method ?? 'morocco')
  const shadowFactor = input.madhab === 'hanafi' ? 2 : 1

  const [year, month, day] = date.split('-').map(Number)
  // Longitude shifts local solar noon away from the civil clock.
  const jd = julian(year, month, day) - lng / (15 * 24)

  /** Local solar noon, as a fraction of the day. */
  const midDay = (guess: number) => fixHour(12 - sunPosition(jd + guess).equationOfTime)

  /**
   * When the sun sits `angle` degrees below the horizon. `before` picks the
   * morning side of noon; otherwise the evening side.
   */
  const atAngle = (angle: number, guess: number, before: boolean) => {
    const { declination } = sunPosition(jd + guess)
    const cosine = (-dsin(angle) - dsin(declination) * dsin(lat)) / (dcos(declination) * dcos(lat))
    // Inside the polar circles the sun may never reach the angle at all.
    if (cosine > 1 || cosine < -1) return NaN
    const hourAngle = darccos(cosine) / 15
    return midDay(guess) + (before ? -hourAngle : hourAngle)
  }

  /** When an object's shadow has grown to `factor` times its own length. */
  const asrAt = (guess: number) => {
    const { declination } = sunPosition(jd + guess)
    const angle = -darccot(shadowFactor + dtan(Math.abs(lat - declination)))
    return atAngle(angle, guess, false)
  }

  // 0.833° is the sun's own radius plus atmospheric refraction at the horizon.
  const HORIZON = 0.833
  const settle = (solve: (guess: number) => number, seed: number) => {
    let t = seed
    for (let i = 0; i < 3; i++) t = solve(t / 24)
    return t
  }

  const dhuhr = settle((g) => midDay(g), 12)
  const sunrise = settle((g) => atAngle(HORIZON, g, true), 6)
  const maghrib = settle((g) => atAngle(HORIZON, g, false), 18)
  const fajr = settle((g) => atAngle(method.fajr, g, true), 5)
  const asr = settle(asrAt, 13)
  const isha = typeof method.isha === 'number'
    ? settle((g) => atAngle(method.isha as number, g, false), 18)
    : maghrib + method.isha.minutesAfterMaghrib / 60

  /** Solar time to the civil clock, then to HH:MM. */
  const clock = (hours: number, prayer?: Prayer) => {
    if (!Number.isFinite(hours)) return '--:--'
    // Rounded to the nearest minute before wrapping, so 23:59:40 does not
    // become 24:00 and then 00:00 on the wrong day.
    const total = Math.round((hours + tz - lng / 15) * 60) + (prayer ? method.adjust?.[prayer] ?? 0 : 0)
    const wrapped = wrap(total, 1440)
    const h = Math.floor(wrapped / 60)
    return `${String(h).padStart(2, '0')}:${String(Math.round(wrapped % 60)).padStart(2, '0')}`
  }

  return {
    fajr: clock(fajr, 'fajr'),
    sunrise: clock(sunrise),
    dhuhr: clock(dhuhr, 'dhuhr'),
    asr: clock(asr, 'asr'),
    maghrib: clock(maghrib, 'maghrib'),
    isha: clock(isha, 'isha'),
  }
}

/**
 * A zone's offset from UTC, in hours, on a given day — so DST is whatever it
 * actually was then, not whatever it is now.
 */
export function utcOffsetHours(timeZone: string, date: string): number {
  try {
    const at = new Date(date + 'T12:00:00Z')
    const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
    const asLocal = new Date(at.toLocaleString('en-US', { timeZone }))
    return (asLocal.getTime() - asUtc.getTime()) / 3_600_000
  } catch {
    return 0
  }
}
