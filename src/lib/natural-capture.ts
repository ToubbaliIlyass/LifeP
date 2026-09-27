import { addDays, localDateStr, todayStr } from '@/lib/date'
import type { QuickType } from '@/lib/quick-add'

/**
 * Reads what you meant out of one line of typing.
 *
 * "task call the dentist tomorrow" is a Task called "call the dentist", due
 * tomorrow, without touching a chip or a date box. Plain string matching, no
 * model: this runs on every keystroke, has to be instant and offline, and
 * must never surprise anyone — a regex that misses is a nuisance, whereas a
 * model that hallucinates a due date is a lost appointment.
 *
 * Two rules keep it honest:
 *
 *   conservative  a type word only counts at the *start* of the line. Match
 *                 it anywhere and "study for the exam" becomes an Exam
 *                 called "study for the", which is worse than not trying.
 *   visible       whatever is recognised is reported in `matched` so the UI
 *                 can show what it took, and every word it consumed is one
 *                 the user can delete to undo it.
 *
 * Pure, and the clock is an argument, so every rule below can be exercised
 * against fixed dates rather than by waiting until Tuesday.
 */

export interface ParsedCapture {
  /** The line with every recognised phrase removed. */
  title: string
  /** Set only when the line opens with a type word. */
  type: QuickType | null
  /** YYYY-MM-DD, for the types that have a date. */
  date: string | null
  /** daily/weekly/weekdays, for Habit. */
  frequency: string | null
  /** A bare number, for HealthMetric. */
  value: number | null
  /** What was picked up, for the hint under the input. */
  matched: { field: string; text: string }[]
}

/** Longest first, so "to-do" is tried before "to". */
const TYPE_WORDS: [string, QuickType][] = [
  ['assignment', 'Assignment'], ['homework', 'Assignment'],
  ['appointment', 'Event'], ['meeting', 'Event'], ['event', 'Event'],
  ['project', 'Project'],
  ['habit', 'Habit'],
  ['health', 'HealthMetric'], ['metric', 'HealthMetric'],
  ['course', 'Course'], ['class', 'Course'],
  ['exam', 'Exam'],
  ['goal', 'Goal'],
  ['note', 'Note'],
  ['task', 'Task'], ['todo', 'Task'], ['to-do', 'Task'],
]

const TYPE_RE = new RegExp(
  `^\\s*(${TYPE_WORDS.map(([w]) => w.replace('-', '\\-')).join('|')})\\b\\s*[:\\-–]?\\s*`,
  'i',
)

const WEEKDAYS: [RegExp, number][] = [
  [/sun(day)?/i, 0], [/mon(day)?/i, 1], [/tue(s|sday)?/i, 2], [/wed(nesday)?/i, 3],
  [/thu(r|rs|rsday)?/i, 4], [/fri(day)?/i, 5], [/sat(urday)?/i, 6],
]

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/** Words that introduce a date and should be eaten with it, not left dangling. */
const LEAD = '(?:\\b(?:due|on|by|at|before)\\s+)?'

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  // Clamp: 31 January plus a month is 28/29 February, not 3 March.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return localDateStr(d)
}

/** The coming `dow`. Today counts as itself; `next` always pushes a week on. */
function nextWeekday(today: string, dow: number, forceNext: boolean): string {
  const current = new Date(today + 'T00:00:00').getDay()
  let delta = (dow - current + 7) % 7
  if (forceNext && delta === 0) delta = 7
  else if (forceNext) delta += 7
  return addDays(today, delta)
}

/** A day/month pair, given which comes first in this locale. */
function fromParts(today: string, a: number, b: number, year: number | null, dayFirst: boolean): string | null {
  // One of them being over 12 settles the order regardless of locale.
  let day: number, month: number
  if (a > 12 && b <= 12) { day = a; month = b }
  else if (b > 12 && a <= 12) { month = a; day = b }
  else if (dayFirst) { day = a; month = b }
  else { month = a; day = b }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const thisYear = Number(today.slice(0, 4))
  const y = year === null ? thisYear : year < 100 ? 2000 + year : year
  const d = new Date(y, month - 1, day)
  if (d.getMonth() !== month - 1) return null // 31 April and friends
  const result = localDateStr(d)
  // A bare day/month that has already gone means next year, the way a diary
  // would read it.
  return year === null && result < today ? localDateStr(new Date(y + 1, month - 1, day)) : result
}

function fromMonthName(today: string, monthIndex: number, day: number, year: number | null): string | null {
  if (day < 1 || day > 31) return null
  const thisYear = Number(today.slice(0, 4))
  const y = year === null ? thisYear : year < 100 ? 2000 + year : year
  const d = new Date(y, monthIndex, day)
  if (d.getMonth() !== monthIndex) return null
  const result = localDateStr(d)
  return year === null && result < today ? localDateStr(new Date(y + 1, monthIndex, day)) : result
}

interface Rule {
  re: RegExp
  /** Returns YYYY-MM-DD, or null to decline the match and keep the text. */
  resolve: (m: RegExpMatchArray, today: string, dayFirst: boolean) => string | null
}

/*
 * Tried in order, first match wins — so "day after tomorrow" must come
 * before "tomorrow", and "next week" before the weekday names.
 */
const DATE_RULES: Rule[] = [
  { re: new RegExp(`${LEAD}\\bday after tomorrow\\b`, 'i'), resolve: (_m, t) => addDays(t, 2) },
  { re: new RegExp(`${LEAD}\\b(today|tonight)\\b`, 'i'), resolve: (_m, t) => t },
  { re: new RegExp(`${LEAD}\\b(tomorrow|tmr|tmw|tmrw)\\b`, 'i'), resolve: (_m, t) => addDays(t, 1) },
  { re: new RegExp(`${LEAD}\\bnext week\\b`, 'i'), resolve: (_m, t) => addDays(t, 7) },
  { re: new RegExp(`${LEAD}\\bnext month\\b`, 'i'), resolve: (_m, t) => addMonths(t, 1) },
  {
    re: new RegExp(`${LEAD}\\bin (\\d{1,3}) (day|days|week|weeks|month|months)\\b`, 'i'),
    resolve: (m, t) => {
      const n = Number(m[1])
      const unit = m[2].toLowerCase()
      if (unit.startsWith('day')) return addDays(t, n)
      if (unit.startsWith('week')) return addDays(t, n * 7)
      return addMonths(t, n)
    },
  },
  {
    re: new RegExp(`${LEAD}\\b(next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\\b`, 'i'),
    resolve: (m, t) => {
      const word = m[2]
      const entry = WEEKDAYS.find(([re]) => new RegExp(`^${re.source}$`, 'i').test(word))
      if (!entry) return null
      return nextWeekday(t, entry[1], /next/i.test(m[1] ?? ''))
    },
  },
  {
    re: new RegExp(`${LEAD}\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`),
    resolve: (m) => {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return d.getMonth() === Number(m[2]) - 1 ? localDateStr(d) : null
    },
  },
  {
    re: new RegExp(`${LEAD}\\b(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?\\b`),
    resolve: (m, t, dayFirst) =>
      fromParts(t, Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, dayFirst),
  },
  {
    re: new RegExp(`${LEAD}\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
    resolve: (m, t) => fromMonthName(t, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), Number(m[2]), m[3] ? Number(m[3]) : null),
  },
  {
    re: new RegExp(`${LEAD}\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
    resolve: (m, t) => fromMonthName(t, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), Number(m[1]), m[3] ? Number(m[3]) : null),
  },
]

const FREQUENCY_RULES: [RegExp, string][] = [
  [/\bevery ?day\b|\bdaily\b/i, 'daily'],
  [/\bweekdays?\b|\bevery weekday\b/i, 'weekdays'],
  [/\bevery week\b|\bweekly\b/i, 'weekly'],
]

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim()

/**
 * Whether this locale writes the day before the month, which is the only way
 * to read "5/9" — one of them being over 12 settles it, nothing else does.
 */
export function localeIsDayFirst(): boolean {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'numeric' })
      .formatToParts(new Date(2000, 0, 2))
    return parts.findIndex((p) => p.type === 'day') < parts.findIndex((p) => p.type === 'month')
  } catch {
    return true
  }
}

/**
 * Removes the leading type word, if there is one.
 *
 * Used when the user picks a type by hand: the words in the line would
 * otherwise keep overriding the chip they just pressed, and the control
 * would appear not to work. One rule throughout — set something by hand and
 * the words that were setting it come out of the text.
 */
export function stripTypeWord(input: string): string {
  return input.replace(TYPE_RE, '')
}

export function parseCapture(
  input: string,
  options: { today?: string; dayFirst?: boolean; forType?: QuickType } = {},
): ParsedCapture {
  const today = options.today ?? todayStr()
  const dayFirst = options.dayFirst ?? true
  const matched: ParsedCapture['matched'] = []

  let rest = input
  let type: QuickType | null = null

  const typeMatch = rest.match(TYPE_RE)
  if (typeMatch) {
    const word = typeMatch[1].toLowerCase()
    const found = TYPE_WORDS.find(([w]) => w === word)
    if (found) {
      type = found[1]
      rest = rest.slice(typeMatch[0].length)
      matched.push({ field: 'type', text: typeMatch[1] })
    }
  }

  // Which extra field is worth looking for depends on what is being made.
  // Hunting for a date in a health reading would eat the number.
  const effective = type ?? options.forType ?? 'Task'
  let date: string | null = null
  let frequency: string | null = null
  let value: number | null = null

  if (effective === 'Habit') {
    for (const [re, freq] of FREQUENCY_RULES) {
      const m = rest.match(re)
      if (!m) continue
      frequency = freq
      rest = rest.replace(re, ' ')
      matched.push({ field: 'frequency', text: m[0].trim() })
      break
    }
  } else if (effective === 'HealthMetric') {
    const m = rest.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs|km|mi|m|min|mins|bpm|%)?\b/i)
    if (m) {
      value = Number(m[1].replace(',', '.'))
      rest = rest.replace(m[0], ' ')
      matched.push({ field: 'value', text: m[0].trim() })
    }
  } else if (effective !== 'Note' && effective !== 'Course') {
    for (const rule of DATE_RULES) {
      const m = rest.match(rule.re)
      if (!m) continue
      const resolved = rule.resolve(m, today, dayFirst)
      if (!resolved) continue
      date = resolved
      rest = rest.replace(m[0], ' ')
      matched.push({ field: 'date', text: m[0].trim() })
      break
    }
  }

  return { title: tidy(rest), type, date, frequency, value, matched }
}
