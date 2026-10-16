/**
 * The time on the user's wall, in the browser.
 *
 * Browsers carry their own copy of the time-zone database, and it can be
 * wrong: when Morocco went back to UTC+0, the Mac's own clock followed and
 * the browser's copy did not, so every "now" and every "today" Acture worked
 * out on screen was an hour ahead of the clock on the wall. No zone name
 * fixes that — every name for Casablanca reads the same stale data — so the
 * user can pin the zone instead (Settings → Location & time), and the screen
 * reads its clock through here.
 *
 * `wallNow()` returns a Date whose local fields (getHours, getDate, …) are
 * the wall clock in the chosen zone. Everything already written in terms of
 * local fields — date strings, minutes past midnight, the calendar's now
 * line — is then right without knowing any of this. With no zone pinned it
 * is plain `new Date()`, and on the server it always is.
 */

const STORAGE_KEY = 'acture-time-zone'

function valid(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true } catch { return false }
}

function stored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const z = window.localStorage.getItem(STORAGE_KEY)
    return valid(z) ? z : null
  } catch {
    return null
  }
}

/** Read from this device first, so the first paint is already right; settings confirm it. */
let pinned: string | null = stored()

/** Pins the zone (or unpins it with null), and remembers it on this device. */
export function setClockZone(zone: string | null) {
  pinned = valid(zone) ? zone : null
  if (typeof window === 'undefined') return
  try {
    if (pinned) window.localStorage.setItem(STORAGE_KEY, pinned)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage blocked: the pin still holds for this page */ }
}

/** The zone pinned in Settings, if any. */
export function pinnedZone(): string | null {
  return pinned
}

/** The zone the user lives in: the pinned one, else what the browser says. */
export function clockZone(): string | undefined {
  if (pinned) return pinned
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined } catch { return undefined }
}

/** Now, as a Date whose local fields read the user's wall clock. */
export function wallNow(at: Date = new Date()): Date {
  if (!pinned) return at
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: pinned,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  )
  return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second, at.getMilliseconds())
}

/**
 * The fixed offsets offered in Settings. IANA writes them with the sign
 * reversed — Etc/GMT-1 is UTC+1 — which is exactly the kind of thing that
 * belongs in one place.
 */
export const FIXED_ZONES: { zone: string; label: string }[] = Array.from({ length: 27 }, (_, i) => {
  const offset = i - 12
  const zone = offset === 0 ? 'Etc/UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`
  return { zone, label: `UTC${offset >= 0 ? `+${offset}` : `−${Math.abs(offset)}`}` }
})
