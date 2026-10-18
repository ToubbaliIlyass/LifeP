/**
 * What the time is where the user is.
 *
 * The planner used the server's clock, and once deployed the server is in
 * UTC: "now" was an hour out for someone in Morocco, and in the hour around
 * midnight "today" was the wrong day altogether — so it planned into hours
 * that had gone, or refused a day that had not started. Every planning path
 * asks this instead, with the zone the browser reports or the one saved with
 * the user's location, and falls back to the server's own clock only when
 * neither is known.
 */
export interface UserClock {
  /** YYYY-MM-DD, in the user's zone. */
  date: string
  /** Minutes past midnight, in the user's zone. */
  minutes: number
  /** The zone this was read in, when one was known. */
  zone?: string | null
}

export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function clockIn(zone?: string | null, at: Date = new Date()): UserClock {
  if (isTimeZone(zone)) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      })
        .formatToParts(at)
        .map((p) => [p.type, p.value]),
    )
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
      zone,
    }
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    minutes: at.getHours() * 60 + at.getMinutes(),
  }
}

/**
 * The zone a request speaks for: the one pinned in Settings, then the one the
 * browser sent, then the one saved with the location. Pinned comes first
 * because a browser's own zone data can be out of date — see wallclock.ts.
 */
export function zoneFor(
  requested: string | null | undefined,
  saved: string | null | undefined,
  pinned?: string | null,
): string | null {
  if (isTimeZone(pinned)) return pinned
  if (isTimeZone(requested)) return requested
  if (isTimeZone(saved)) return saved
  return null
}

/** Now on the user's wall clock, as reminders write it: YYYY-MM-DDTHH:MM. See src/lib/reminders.ts. */
export function momentIn(zone: string | null): string {
  const c = clockIn(zone)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${c.date}T${p(Math.floor(c.minutes / 60))}:${p(c.minutes % 60)}`
}
