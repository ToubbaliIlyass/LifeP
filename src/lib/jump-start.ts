import { addDays } from '@/lib/date'

/**
 * Jump Start: a day typed the way it is said.
 *
 * "tom", "sat", "in four days", "aug 1", "tonight", "wed 8pm" — read into
 * the same fields the menu's buttons set, so typing and clicking can never
 * disagree. Pure and table-tested (jump-start.test.ts): a date parser is
 * exactly the kind of code that is wrong on one weekday in seven.
 */
export interface WhenGuess {
  when: string | null
  evening: boolean
  someday: boolean
  /** HH:MM, when a time was said. */
  reminder: string | null
  /** What it understood, for the suggestion line. */
  label: string
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fourteen: 14, twenty: 20, thirty: 30,
}
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')
const dowOf = (day: string) => new Date(day + 'T00:00:00').getDay()

/** A word that starts a longer one, at least `min` letters in: "tom" for tomorrow, "sat" for saturday. */
const starts = (word: string, full: string, min = 2) => word.length >= min && full.startsWith(word)

/** "8pm", "8:30am", "20:00", "at 9" → minutes past midnight, or null. */
function readTime(text: string): { minutes: number; rest: string } | null {
  const m = text.match(/(?:^|\s)(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?=\s|$)/i)
  if (!m) return null
  const hasMarker = !!m[3] || !!m[2] || /\bat\s+\d/i.test(m[0])
  if (!hasMarker) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (h > 23 || min > 59) return null
  if (ap?.startsWith('p') && h < 12) h += 12
  if (ap?.startsWith('a') && h === 12) h = 0
  return { minutes: h * 60 + min, rest: (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).trim() }
}

function describe(day: string, today: string): string {
  const n = Math.round((new Date(day + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 864e5)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  const d = new Date(day + 'T00:00:00')
  if (n > 1 && n < 7) return DAY_NAMES[d.getDay()]
  return `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

export function parseWhen(input: string, today: string): WhenGuess | null {
  let text = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!text) return null

  let reminder: string | null = null
  const time = readTime(text)
  if (time) {
    reminder = `${pad(Math.floor(time.minutes / 60))}:${pad(time.minutes % 60)}`
    text = time.rest
  }

  const guess = (when: string | null, extra: Partial<WhenGuess> = {}): WhenGuess => {
    const base = { when, evening: false, someday: false, reminder, ...extra }
    const what = base.someday ? 'Someday' : base.evening ? 'This Evening' : when ? describe(when, today) : 'Today'
    return { ...base, label: reminder ? `${what} at ${reminder}` : what }
  }

  // A time on its own means today, at that time.
  if (!text) return reminder ? guess(today) : null

  if (starts(text, 'someday', 3) || text === 'later') return { when: null, evening: false, someday: true, reminder: null, label: 'Someday' }
  if (starts(text, 'today', 3) || text === 'now') return guess(today)
  if (starts(text, 'tonight', 3) || starts(text, 'this evening', 6) || starts(text, 'evening', 3)) return guess(today, { evening: true })
  if (starts(text, 'tomorrow', 3) || text === 'tmr' || text === 'tmrw') return guess(addDays(today, 1))
  if (text === 'next week') return guess(addDays(today, 7 - ((dowOf(today) + 6) % 7)))

  // "in 4 days", "in four days", "in 2 weeks", "in a week"
  const inN = text.match(/^in (\S+)(?: (d|da|day|days|w|we|week|weeks|m|mo|month|months))?$/)
  if (inN) {
    const n = /^\d+$/.test(inN[1]) ? Number(inN[1]) : NUMBERS[inN[1]]
    if (n !== undefined) {
      const unit = inN[2] ?? 'd'
      const days = unit.startsWith('w') ? n * 7 : unit.startsWith('m') ? n * 30 : n
      return guess(addDays(today, days))
    }
  }

  // "sat", "saturday", "next saturday": the next one, never today itself.
  const wd = text.match(/^(?:next |on )?([a-z]+)$/)
  if (wd) {
    const i = WEEKDAYS.findIndex((w) => starts(wd[1], w, 2))
    if (i >= 0) {
      const ahead = (i - dowOf(today) + 7) % 7 || 7
      return guess(addDays(today, ahead))
    }
  }

  // "aug 1", "august 1", "1 aug", "1st of august": this year, or next if gone.
  const md = text.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/) ?? text.match(/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)$/)
  if (md) {
    const [word, num] = /^\d/.test(md[1]) ? [md[2], md[1]] : [md[1], md[2]]
    const month = MONTHS.findIndex((m) => starts(word, m, 3))
    const date = Number(num)
    if (month >= 0 && date >= 1 && date <= 31) {
      const year = Number(today.slice(0, 4))
      let day = `${year}-${pad(month + 1)}-${pad(date)}`
      if (day < today) day = `${year + 1}-${pad(month + 1)}-${pad(date)}`
      if (!Number.isNaN(new Date(day + 'T00:00:00').getTime())) return guess(day)
    }
  }

  // An ISO date, typed or pasted.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return guess(text)

  return null
}

/*
 * Words a day or a time is made of. A title is only split when every word of
 * its tail is one of these — so "call Tom" and "read the Sat essay notes"
 * keep their words, while "call the bank tomorrow 3pm" loses the last two.
 */
const WHEN_WORD = new RegExp(
  '^(?:' + [
    'today', 'tonight', 'tomorrow', 'tmr', 'tmrw', 'someday', 'next', 'this', 'evening', 'in', 'on', 'at',
    'a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'days?', 'weeks?', 'months?',
    'mon(?:day)?', 'tue(?:s(?:day)?)?', 'wed(?:nesday)?', 'thu(?:r(?:s(?:day)?)?)?', 'fri(?:day)?', 'sat(?:urday)?', 'sun(?:day)?',
    'jan(?:uary)?', 'feb(?:ruary)?', 'mar(?:ch)?', 'apr(?:il)?', 'may', 'june?', 'july?', 'aug(?:ust)?', 'sept?(?:ember)?', 'oct(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?',
    '\\d{1,2}(?:st|nd|rd|th)?', '\\d{1,2}(?::\\d{2})?(?:am|pm|a|p)', '\\d{1,2}:\\d{2}', 'am', 'pm', '\\d{4}-\\d{2}-\\d{2}',
  ].join('|') + ')$',
  'i',
)
/** Abbreviations that are also ordinary words, only taken as days after "on"/"next" or beside a time. */
const AMBIGUOUS = new Set(['sat', 'sun', 'wed', 'mar', 'may', 'a', 'an', 'in', 'on', 'at', 'this', 'next', 'evening'])

export interface SplitTitle {
  /** The title with the day and time taken off. */
  title: string
  guess: WhenGuess
  /** The words that were read as the day, for showing what was understood. */
  phrase: string
}

/**
 * "Dentist fri 3pm" → "Dentist", Friday at 15:00.
 *
 * The longest tail of the title that reads as a day and/or time, taken off
 * it. Nothing is split unless something real is left as the title, and a
 * lone ambiguous word is never enough on its own ("Read on" stays as it is).
 */
export function splitWhen(input: string, today: string): SplitTitle | null {
  const words = input.trim().split(/\s+/)
  if (words.length < 2) return null
  for (let k = Math.min(5, words.length - 1); k >= 1; k--) {
    const tail = words.slice(-k)
    if (!tail.every((w) => WHEN_WORD.test(w.replace(/[,.]$/, '')))) continue
    const meaningful = tail.filter((w) => !AMBIGUOUS.has(w.toLowerCase()))
    if (meaningful.length === 0) continue
    const phrase = tail.join(' ').replace(/[,.]$/, '')
    const guess = parseWhen(phrase.replace(/^(?:on|at)\s+/i, ''), today)
    if (!guess) continue
    const title = words.slice(0, -k).join(' ').replace(/\s+(?:on|at|by)$/i, '').trim()
    if (!title) continue
    return { title, guess, phrase }
  }
  return null
}
