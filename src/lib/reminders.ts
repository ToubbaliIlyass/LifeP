/**
 * When things remind you.
 *
 * A to-do, a habit or an event can carry any of three reminders, plus a
 * snooze:
 *
 *   reminder      HH:MM on its own day — each day, for a habit or a weekly class
 *   remindBefore  minutes before its time — "10 minutes before the dentist"
 *   remindAt      a moment on any day — "remind me on Friday at 9"
 *   snoozedUntil  a moment it was put off to, from a reminder that went off
 *
 * Everything is a wall-clock moment in the user's own zone, written
 * YYYY-MM-DDTHH:MM, so comparing two is comparing two strings. The same
 * function answers the app (the card that slides in while it is open) and
 * the server (the push that arrives while it is closed), so the two can
 * never disagree about what is due.
 *
 * Pure and table-tested (reminders.test.ts).
 */
import type { DayEvent, Todo, TodosPayload } from './todos'

export interface Reminder {
  /** Unique per item and moment: what "already sent" is recorded against. */
  key: string
  id: number
  kind: 'todo' | 'event'
  title: string
  /** YYYY-MM-DDTHH:MM, the user's wall clock. */
  at: string
  /** The line under the title: when it is, and what this reminder is for. */
  body: string
  /** For a to-do: 'Task' or 'Habit' — which route ticks it off. */
  itemType?: string
}

/** A wall-clock moment moved by some minutes — across midnight if need be. */
export function shift(moment: string, minutes: number): string {
  const t = new Date(`${moment}:00Z`).getTime() + minutes * 60_000
  return new Date(t).toISOString().slice(0, 16)
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** "10 minutes", "1 hour", "1 hour 30 minutes", "1 day". */
export function lead(minutes: number): string {
  if (minutes % 1440 === 0) return plural(minutes / 1440, 'day')
  const h = Math.floor(minutes / 60), m = minutes % 60
  return [h && plural(h, 'hour'), m && plural(m, 'minute')].filter(Boolean).join(' ')
}

function forTodo(t: Todo): Reminder[] {
  if (t.done || t.type === 'Prayer') return []
  const out: Reminder[] = []
  const add = (at: string, body: string) => out.push({ key: `todo:${t.id}:${at}`, id: t.id, kind: 'todo', title: t.title || 'To-do', at, body, itemType: t.type })
  const timed = t.when && t.time ? `${t.when}T${t.time}` : null
  if (t.when && t.reminder) add(`${t.when}T${t.reminder}`, t.time && t.time !== t.reminder ? `Reminder · it’s at ${t.time}` : `Reminder · ${t.reminder}`)
  if (timed && t.remindBefore) add(shift(timed, -t.remindBefore), `In ${lead(t.remindBefore)} · ${t.time}`)
  if (t.remindAt) add(t.remindAt, `Reminder · ${t.remindAt.slice(11)}`)
  if (t.snoozedUntil) add(t.snoozedUntil, 'Snoozed reminder')
  return out
}

function forEvent(e: DayEvent): Reminder[] {
  const out: Reminder[] = []
  const where = e.location ? ` · ${e.location}` : ''
  const add = (at: string, body: string) => out.push({ key: `event:${e.id}:${at}`, id: e.id, kind: 'event', title: e.title || 'Event', at, body })
  if (e.reminder) add(`${e.date}T${e.reminder}`, `${e.time ? `At ${e.time}` : 'Today'}${where}`)
  if (e.time && e.remindBefore) add(shift(`${e.date}T${e.time}`, -e.remindBefore), `In ${lead(e.remindBefore)} · ${e.time}${where}`)
  // A repeating event is listed once per day it is on; its snooze is one moment.
  if (e.snoozedUntil && e.snoozedUntil.slice(0, 10) === e.date) add(e.snoozedUntil, `Snoozed reminder${e.time ? ` · ${e.time}` : ''}`)
  return out
}

/** Every reminder the lists hold, soonest first. */
export function remindersIn(payload: Pick<TodosPayload, 'todos' | 'events'>): Reminder[] {
  const all = [...payload.todos.flatMap(forTodo), ...payload.events.flatMap(forEvent)]
  // One reminder per item and moment, even when two kinds land on the same minute.
  const seen = new Set<string>()
  return all.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true))).sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * The reminders due now: their moment has come, within the last `withinMin`
 * minutes (older than that is a reminder missed, not one to send now), and
 * not already sent.
 */
export function dueReminders(all: Reminder[], now: string, sent: Set<string> = new Set(), withinMin = 15): Reminder[] {
  const from = shift(now, -withinMin)
  return all.filter((r) => r.at <= now && r.at > from && !sent.has(r.key))
}

/** Snooze choices, as minutes from now; "tomorrow" is tomorrow at 9:00. */
export const SNOOZES = [
  { label: '10 min', minutes: 10 },
  { label: '1 hour', minutes: 60 },
  { label: 'Tomorrow', minutes: null },
] as const

/** The moment a snooze chosen at `now` ends. */
export function snoozeUntil(now: string, minutes: number | null): string {
  if (minutes !== null) return shift(now, minutes)
  return `${shift(now, 24 * 60).slice(0, 10)}T09:00`
}

const HHMM = /^\d{2}:\d{2}$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * Writes whichever reminder fields a request carries onto a node's
 * properties, each checked — null (or anything malformed) clears it. Fields
 * the request does not mention are left alone. Shared by the to-do and the
 * event routes, so both accept exactly the same thing.
 */
export function applyReminderChanges(p: Record<string, unknown>, body: Record<string, unknown>, now?: string) {
  const set = (key: string, value: unknown) => { if (value === null || value === undefined) delete p[key]; else p[key] = value }
  if ('reminder' in body) set('reminder', typeof body.reminder === 'string' && HHMM.test(body.reminder) ? body.reminder : null)
  if ('remindBefore' in body) {
    const m = body.remindBefore
    set('remindBefore', typeof m === 'number' && m > 0 && m <= 7 * 24 * 60 ? Math.round(m) : null)
  }
  if ('remindAt' in body) set('remindAt', typeof body.remindAt === 'string' && MOMENT.test(body.remindAt) ? body.remindAt : null)
  if ('snoozedUntil' in body) set('snoozedUntil', typeof body.snoozedUntil === 'string' && MOMENT.test(body.snoozedUntil) ? body.snoozedUntil : null)
  // From a notification's Snooze button, which knows "10 minutes" but not the
  // user's clock: the route passes `now`, on that clock.
  if (typeof body.snoozeMinutes === 'number' && now && body.snoozeMinutes > 0 && body.snoozeMinutes <= 7 * 24 * 60) {
    set('snoozedUntil', snoozeUntil(now, Math.round(body.snoozeMinutes)))
  }
}

/** How many sent reminders an item remembers, to never send one twice. */
const SENT_KEEP = 20
/** Records reminders as sent on an item's properties. */
export function markSent(p: Record<string, unknown>, keys: string[]) {
  const before = Array.isArray(p.remindersSent) ? (p.remindersSent as unknown[]).filter((k): k is string => typeof k === 'string') : []
  p.remindersSent = [...new Set([...before, ...keys])].slice(-SENT_KEEP)
}
/** The reminders an item has already sent. */
export function sentOn(p: Record<string, unknown>): string[] {
  return Array.isArray(p.remindersSent) ? (p.remindersSent as unknown[]).filter((k): k is string => typeof k === 'string') : []
}
