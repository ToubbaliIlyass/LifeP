import { addDays, isDueOn } from '@/lib/date'
import { parseWhen, splitWhen } from '@/lib/jump-start'

/**
 * Quick entry: a whole to-do or event in one line.
 *
 *   event: Compilers lecture every tue and thu at 10:00 for 90m @B12
 *   review ML notes do tomorrow due fri for 45m #school !! every day x5 /AUI
 *
 * A keyword starts each piece and the words after it are its value; whatever
 * is left is the title. Every piece is optional, and a day said plainly at
 * the end still works ("call the bank tomorrow 3pm"), so nobody has to learn
 * any of this to use the app — it is there for when typing is faster than
 * clicking.
 *
 *   event: / todo:   what it is (also just "event" or "todo" first)
 *   do <day>         the day to do it            on <day> works too
 *   due <day>        the deadline                by <day> works too
 *   at <time>        the time                    3pm, 15:00, 9:30am
 *   from <t> till <t>  a start and an end             from 11:30am till 12:50pm, 9-10:30am, 9 to 5
 *   for <length>     how long                    45m, 1h, 1h30, 90 minutes, an hour
 *   #tag             a tag                       as many as you like
 *   ! / !! / !low    priority                    high, or low
 *   every <rule>     repeats                     day, weekday, week, mon, tue and thu
 *   x5 / 5 times     how many times              stops after that many
 *   until <day>      when repeating stops        ending on dec 11, ends dec 11, through dec 11
 *   /<list>          which project or area       the start of its name is enough
 *   @<place>         where — for an event        @Room_12 for two words
 *
 * Pure and table-tested (quick-entry.test.ts): it decides what gets written.
 */
export interface Entry {
  kind: 'todo' | 'event' | null
  title: string
  when: string | null
  evening: boolean
  someday: boolean
  deadline: string | null
  time: string | null
  /** When it finishes that day, when said as a range ("from 9 till 10:30"). */
  endTime: string | null
  minutes: number | null
  tags: string[]
  priority: 'high' | 'low' | null
  repeats: 'daily' | 'weekdays' | 'weekly' | null
  /** Weekdays for "every tue and thu", 0=Sun. */
  repeatDays: number[] | null
  /** The last day it repeats on — from "until", or worked out from "x5". */
  until: string | null
  /** The start of a project or area's name. */
  list: string | null
  location: string | null
  /** What was understood, one chip per piece, for the preview. */
  pieces: string[]
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')
const clean = (w: string) => w.toLowerCase().replace(/[,.;]$/, '')

/** "45m", "1h", "1h30", "90min", "2hrs" — one word — in minutes. */
function lengthWord(w: string): number | null {
  const m = clean(w).match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?(?:(\d+)\s*(?:m|min|mins|minutes?)?)?$/)
  if (!m || (!m[1] && !m[2])) return null
  // A bare number is not a length ("buy 2 eggs").
  if (!m[1] && /^\d+$/.test(clean(w))) return null
  const minutes = Math.round((m[1] ? Number(m[1]) * 60 : 0) + (m[2] ? Number(m[2]) : 0))
  return minutes > 0 && minutes <= 24 * 60 ? minutes : null
}

/** A length said in words after "for": "45 minutes", "an hour", "half an hour", "2 hours". */
function lengthAt(words: string[], i: number): { minutes: number; used: number } | null {
  const a = clean(words[i] ?? '')
  const b = clean(words[i + 1] ?? '')
  const c = clean(words[i + 2] ?? '')
  if (a === 'half' && b === 'an' && c === 'hour') return { minutes: 30, used: 3 }
  if ((a === 'an' || a === 'a' || a === 'one') && b === 'hour') return { minutes: 60, used: 2 }
  if (/^\d+(\.\d+)?$/.test(a) && /^(h|hr|hrs|hours?)$/.test(b)) return { minutes: Math.round(Number(a) * 60), used: 2 }
  if (/^\d+$/.test(a) && /^(m|min|mins|minutes?)$/.test(b)) return { minutes: Number(a), used: 2 }
  const one = lengthWord(a)
  return one ? { minutes: one, used: 1 } : null
}

/** The longest run of words from `i` (up to 4) that reads as a day. */
function dayAt(words: string[], i: number, today: string, withTime = true): { when: string | null; evening: boolean; someday: boolean; time: string | null; used: number } | null {
  for (let k = Math.min(4, words.length - i); k >= 1; k--) {
    const phrase = words.slice(i, i + k).map(clean).join(' ')
    const g = parseWhen(phrase, today)
    // A deadline is a day, not a time: "due fri at 9am" leaves "at 9am" to be the to-do's time.
    if (g && !withTime && g.reminder) continue
    if (g) return { when: g.someday ? null : g.when, evening: g.evening, someday: g.someday, time: g.reminder, used: k }
  }
  return null
}

/** A time from `i`: "3pm", "3 pm", "15:00", "9:30am". */
function timeAt(words: string[], i: number): { time: string; used: number; meridiem: boolean; marked: boolean } | null {
  for (const k of [2, 1]) {
    if (i + k > words.length) continue
    const phrase = words.slice(i, i + k).map(clean).join('')
    const m = phrase.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/)
    if (!m || (!m[2] && !m[3] && k === 1 && !/^\d{1,2}$/.test(phrase))) continue
    let h = Number(m[1])
    const min = m[2] ? Number(m[2]) : 0
    if (h > 23 || min > 59) continue
    if (m[3]?.startsWith('p') && h < 12) h += 12
    if (m[3]?.startsWith('a') && h === 12) h = 0
    return { time: `${pad(h)}:${pad(min)}`, used: k, meridiem: !!m[3], marked: !!(m[2] || m[3]) }
  }
  return null
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

/**
 * How long a range lasts. An end with no am/pm that would land before the
 * start is the other half of the day ("from 9 to 5" is 9am to 5pm); one that
 * still does not follow the start is not a range at all.
 */
function rangeMinutes(start: string, end: string, endMeridiem: boolean): { end: string; minutes: number } | null {
  const from = toMin(start)
  let to = toMin(end)
  if (to <= from && !endMeridiem && to + 720 <= 24 * 60) to += 720
  if (to <= from) return null
  const clock = `${pad(Math.floor(to / 60) % 24)}:${pad(to % 60)}`
  return { end: clock, minutes: to - from }
}

/** "11:30am-12:50pm", "9-10:30am": one word holding both ends, with a sign it is a time. */
function rangeWord(w: string): { start: string; end: string; startMeridiem: boolean; endMeridiem: boolean } | null {
  const m = clean(w).match(/^(\d{1,2}(?::\d{2})?(?:am|pm|a|p)?)[-–—](\d{1,2}(?::\d{2})?(?:am|pm|a|p)?)$/)
  if (!m) return null
  const a = timeAt([m[1]], 0)
  const b = timeAt([m[2]], 0)
  if (!a || !b || (!a.marked && !b.marked)) return null
  // "9-10:30am": the start takes the end's half of the day when it fits.
  let start = a.time
  if (!a.meridiem && b.meridiem) {
    const shifted = toMin(start) + (/pm?$/.test(m[2]) && Number(start.slice(0, 2)) < 12 ? 720 : 0)
    if (shifted < toMin(b.time)) start = `${pad(Math.floor(shifted / 60))}:${pad(shifted % 60)}`
  }
  return { start, end: b.time, startMeridiem: a.meridiem, endMeridiem: b.meridiem }
}

/** "day", "weekday(s)", "week", "mon", "tue and thu", "mon, wed, fri". */
function ruleAt(words: string[], i: number): { repeats: Entry['repeats']; days: number[] | null; used: number } | null {
  const first = clean(words[i] ?? '')
  if (first === 'day' || first === 'daily' || first === 'morning' || first === 'evening' || first === 'night') return { repeats: 'daily', days: null, used: 1 }
  if (first === 'weekday' || first === 'weekdays') return { repeats: 'weekdays', days: null, used: 1 }
  if (first === 'week' || first === 'weekly') return { repeats: 'weekly', days: null, used: 1 }
  const days: number[] = []
  let used = 0
  for (let j = i; j < words.length; j++) {
    const w = clean(words[j])
    if ((w === 'and' || w === '&') && days.length) { used++; continue }
    const d = /^month/.test(w) ? -1 : WEEKDAYS.findIndex((x) => w.startsWith(x) && w.length >= 3)
    if (d < 0) break
    if (!days.includes(d)) days.push(d)
    used++
  }
  // A trailing "and" belongs to the title, not the rule.
  while (used > 0 && /^(and|&)$/.test(clean(words[i + used - 1]))) used--
  return days.length ? { repeats: 'weekly', days: days.sort((a, b) => a - b), used } : null
}

/** The `n`th day on or after `from` that the rule lands on. */
function nthOccurrence(from: string, n: number, repeats: NonNullable<Entry['repeats']>, days: number[] | null): string {
  const frequency = repeats === 'weekly' && !days ? 'weekly' : repeats
  const rule = repeats === 'weekly' ? days ?? [new Date(from + 'T00:00:00').getDay()] : null
  let found = 0
  let day = from
  for (let guard = 0; guard < 800; guard++) {
    if (isDueOn(frequency, rule, new Date(day + 'T00:00:00').getDay())) {
      found++
      if (found === n) return day
    }
    day = addDays(day, 1)
  }
  return day
}

export function parseEntry(input: string, today: string): Entry | null {
  let words = input.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null

  const e: Entry = {
    kind: null, title: '', when: null, evening: false, someday: false, deadline: null, time: null, endTime: null, minutes: null,
    tags: [], priority: null, repeats: null, repeatDays: null, until: null, list: null, location: null, pieces: [],
  }

  // What it is: "event: …", "todo: …", or the bare word first.
  const head = words[0].toLowerCase()
  const kindOf = (w: string) => (/^(event|ev|appointment|appt)$/.test(w) ? 'event' : /^(todo|to-do|task|t)$/.test(w) ? 'todo' : null)
  if (head.endsWith(':') && kindOf(head.slice(0, -1))) { e.kind = kindOf(head.slice(0, -1)); words = words.slice(1) }
  else if (words.length > 1 && /^(event|todo|to-do|task)$/.test(head)) { e.kind = kindOf(head); words = words.slice(1) }

  let count: number | null = null
  /** Whether the time came after "from", so a bare number can be where it ends. */
  let fromStart = false
  const rest: string[] = []
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]
    const w = clean(raw)
    const next = words[i + 1]

    if (/^#[\p{L}\p{N}_-]+$/u.test(raw)) { e.tags.push(raw.slice(1).replace(/_/g, ' ')); continue }
    if (/^!{1,3}$/.test(w) || /^!(high|hi|urgent)$/.test(w)) { e.priority = 'high'; continue }
    if (/^!(low|lo)$/.test(w)) { e.priority = 'low'; continue }
    if (/^\/\S+$/.test(raw)) { e.list = raw.slice(1).replace(/_/g, ' '); continue }
    if (/^@\S+$/.test(raw) && !/^@\d/.test(raw)) { e.location = raw.slice(1).replace(/_/g, ' '); continue }
    if (/^x\d+$/.test(w)) { count = Number(w.slice(1)); continue }
    if (/^\d+$/.test(w) && /^times?$/.test(clean(next ?? '')) && e.repeats) { count = Number(w); i++; continue }

    // "11:30am-12:50pm" in one word.
    const span = !e.time ? rangeWord(w) : null
    if (span) {
      const r = rangeMinutes(span.start, span.end, span.endMeridiem)
      if (r) { e.time = span.start; e.endTime = r.end; e.minutes = r.minutes; continue }
    }

    // "from 11:30am till 12:50pm", "at 9 to 10:30": an end for the time just read.
    if ((w === 'till' || w === 'til' || w === 'until' || w === 'to' || w === '-' || w === '–') && next && e.time && !e.endTime) {
      const t = timeAt(words, i + 1)
      if (t && (t.marked || fromStart || w !== 'to')) {
        const r = rangeMinutes(e.time, t.time, t.meridiem)
        if (r) { e.endTime = r.end; e.minutes = r.minutes; i += t.used; continue }
      }
    }

    // "ending on dec 11", "through dec 11": when a repeat stops. Only before a day, so "the ending of the book" stays.
    if ((w === 'ending' || w === 'ends' || w === 'end' || w === 'till' || w === 'til' || w === 'through' || w === 'thru') && next) {
      const skip = /^(on|the|by)$/i.test(clean(next)) ? 1 : 0
      const d = dayAt(words, i + 1 + skip, today, false)
      if (d?.when) { e.until = d.when; i += d.used + skip; continue }
    }

    if ((w === 'due' || w === 'by' || w === 'deadline') && next) {
      const d = dayAt(words, i + 1, today, false)
      if (d?.when) { e.deadline = d.when; i += d.used; continue }
    }
    // "from 11:30am …": a time, not a day. A bare number counts only when an end follows ("from 9 to 5").
    if (w === 'from' && next && !e.time) {
      const t = timeAt(words, i + 1)
      const after = clean(words[i + 1 + (t?.used ?? 0)] ?? '')
      if (t && (t.marked || /^(till|til|until|to|-|–)$/.test(after))) { e.time = t.time; fromStart = true; i += t.used; continue }
    }
    if ((w === 'do' || w === 'on' || w === 'starting' || w === 'from') && next) {
      const d = dayAt(words, i + 1, today)
      if (d) {
        e.when = d.when; e.evening = d.evening; e.someday = d.someday
        if (d.time) e.time = d.time
        i += d.used
        continue
      }
    }
    if (w === 'until' && next) {
      const d = dayAt(words, i + 1, today, false)
      if (d?.when) { e.until = d.when; i += d.used; continue }
    }
    if (w === 'at' && next) {
      const t = timeAt(words, i + 1)
      if (t) { e.time = t.time; i += t.used; continue }
    }
    if (w === 'for' && next) {
      const l = lengthAt(words, i + 1)
      if (l) { e.minutes = l.minutes; i += l.used; continue }
    }
    if ((w === 'every' || w === 'each') && next) {
      const r = ruleAt(words, i + 1)
      if (r) { e.repeats = r.repeats; e.repeatDays = r.days; i += r.used; continue }
    }
    if (w === 'daily') { e.repeats = 'daily'; continue }
    // A length on its own, written as one: "45m", "1h30".
    if (/^\d/.test(w) && /[hm]/.test(w)) {
      const l = lengthWord(w)
      if (l) { e.minutes = l; continue }
    }
    rest.push(raw)
  }

  // A day said plainly at the end, as before: "call the bank tomorrow 3pm".
  let title = rest.join(' ')
  const tail = splitWhen(title, today)
  if (tail) {
    title = tail.title
    if (!e.when && !e.someday) { e.when = tail.guess.someday ? null : tail.guess.when; e.evening = tail.guess.evening; e.someday = tail.guess.someday }
    if (!e.time && tail.guess.reminder) e.time = tail.guess.reminder
  }
  e.title = title.replace(/\s+(?:on|at|by|for)$/i, '').trim()

  // "x5": stops after the fifth time, so its last day is the fifth it lands on.
  if (count && count > 0 && e.repeats) {
    const last = nthOccurrence(e.when ?? today, count, e.repeats, e.repeatDays)
    e.until = e.until && e.until < last ? e.until : last
  }
  // A repeating to-do stops at its deadline; "until" is the same thing said differently.
  if (e.until && e.kind !== 'event' && (!e.deadline || e.until < e.deadline)) e.deadline = e.until
  // Repeating "every tue and thu" starts on the first of those days, unless a day was said.
  if (e.repeatDays && !e.when) e.when = nthOccurrence(today, 1, 'weekly', e.repeatDays)

  const short = (day: string) => {
    const n = Math.round((new Date(day + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 864e5)
    if (n === 0) return 'today'
    if (n === 1) return 'tomorrow'
    const d = new Date(day + 'T00:00:00')
    return n > 1 && n < 7 ? DAY_LABEL[d.getDay()] : `${DAY_LABEL[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }
  if (e.kind) e.pieces.push(e.kind === 'event' ? 'Event' : 'To-do')
  if (e.someday) e.pieces.push('Someday')
  else if (e.when) e.pieces.push(e.evening ? `${short(e.when)} evening` : short(e.when))
  if (e.time) e.pieces.push(e.endTime ? `${e.time}–${e.endTime}` : `at ${e.time}`)
  if (e.minutes && !e.endTime) e.pieces.push(e.minutes < 60 ? `${e.minutes}m` : `${+(e.minutes / 60).toFixed(2)}h`)
  if (e.deadline && e.deadline !== e.until) e.pieces.push(`due ${short(e.deadline)}`)
  if (e.repeats) {
    const rule = e.repeatDays ? e.repeatDays.map((d) => DAY_LABEL[d]).join(', ') : e.repeats === 'daily' ? 'day' : e.repeats === 'weekdays' ? 'weekday' : 'week'
    e.pieces.push(`every ${rule}${e.until ? ` until ${short(e.until)}` : ''}`)
  }
  for (const t of e.tags) e.pieces.push(`#${t}`)
  if (e.priority) e.pieces.push(e.priority === 'high' ? 'high priority' : 'low priority')
  if (e.list) e.pieces.push(`→ ${e.list}`)
  if (e.location) e.pieces.push(`@ ${e.location}`)

  return e
}

/** Whether a line said anything beyond its title — worth previewing. */
export const saysMore = (e: Entry | null) => !!e && e.pieces.length > 0
