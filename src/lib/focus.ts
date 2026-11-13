/**
 * Focus time on a to-do: the stretches you spent on it, as the moment each
 * began and the moment it ended. A stretch with no end is the one running.
 *
 * Only moments are stored, never a counter. The time shown is worked out from
 * them, so it is right after the phone slept, the tab was closed, or the task
 * was opened on another device. Pausing ends a stretch; resuming begins the
 * next; the total is the stretches added up.
 */

export interface FocusSession {
  /** ISO timestamp. */
  start: string
  /** ISO timestamp; absent while it is running. */
  end?: string
}

/** A task is for a day's work, not a month's: more than this many stretches is a runaway. */
const MAX_SESSIONS = 200

const ms = (iso: string) => Date.parse(iso)

/** Reads whatever a node stored into clean sessions, dropping anything that is not one. Always in order. */
export function sessionsOf(raw: unknown): FocusSession[] {
  if (!Array.isArray(raw)) return []
  const out: FocusSession[] = []
  for (const r of raw) {
    const s = (r ?? {}) as Record<string, unknown>
    if (typeof s.start !== 'string' || Number.isNaN(ms(s.start))) continue
    const end = typeof s.end === 'string' && !Number.isNaN(ms(s.end)) && ms(s.end) >= ms(s.start) ? s.end : undefined
    out.push(end ? { start: s.start, end } : { start: s.start })
  }
  out.sort((a, b) => ms(a.start) - ms(b.start))
  // Only the latest can still be running; an older one left open was never stopped, so it ends where the next begins.
  return out.slice(-MAX_SESSIONS).map((s, i, all) => (!s.end && i < all.length - 1 ? { start: s.start, end: all[i + 1].start } : s))
}

export function isRunning(sessions: FocusSession[]): boolean {
  return sessions.length > 0 && !sessions[sessions.length - 1].end
}

/** Starts (or resumes). Already running: nothing changes. */
export function startFocus(sessions: FocusSession[], now: string): FocusSession[] {
  return isRunning(sessions) ? sessions : [...sessions, { start: now }].slice(-MAX_SESSIONS)
}

/** Pauses. Not running: nothing changes. */
export function pauseFocus(sessions: FocusSession[], now: string): FocusSession[] {
  if (!isRunning(sessions)) return sessions
  const last = sessions[sessions.length - 1]
  return [...sessions.slice(0, -1), { start: last.start, end: ms(now) >= ms(last.start) ? now : last.start }]
}

/** Milliseconds worked, counting a running stretch up to `nowMs`. */
export function focusedMs(sessions: FocusSession[], nowMs: number): number {
  let total = 0
  for (const s of sessions) total += Math.max(0, (s.end ? ms(s.end) : nowMs) - ms(s.start))
  return total
}

/** The first moment you began, or null when you never have. */
export function firstStart(sessions: FocusSession[]): string | null {
  return sessions[0]?.start ?? null
}

/** "1:05:09" or "5:09": hours only when there are some. */
export function clockText(totalMs: number): string {
  const s = Math.floor(Math.max(0, totalMs) / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

/** "1 h 5 min", "12 min", "under a minute": for the log, where seconds are noise. */
export function spentText(totalMs: number): string {
  const min = Math.round(Math.max(0, totalMs) / 60000)
  if (min < 1) return 'under a minute'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
