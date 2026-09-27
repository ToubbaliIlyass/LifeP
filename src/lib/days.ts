/**
 * Days of the week, in the one spelling the whole app uses.
 *
 * Its own module, and deliberately free of imports: the labels and the
 * phrasing are wanted in the browser — the settings panel and the setup
 * interview both draw a day picker — while the code that reasons about days
 * lives in src/lib/availability.ts, which reaches the database through
 * graph/queries. Importing that from a client component pulled the libSQL
 * client into the bundle, where its `file:` URL is not a thing a browser can
 * open, and the page died on load.
 *
 * 0 = Sunday … 6 = Saturday, everywhere. An empty list means every day.
 */

/** Initials, indexed by day number. */
export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Monday first, the week most people picture, Sunday at the end. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "every day" / "weekdays" / "weekends" / "Mon, Wed", so a rule and a part
 *  of the day read the same way wherever either is printed. */
export function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'every day'
  const key = [...days].sort().join(',')
  if (key === '1,2,3,4,5') return 'weekdays'
  if (key === '0,6') return 'weekends'
  return [...days].sort().map((d) => DAY_SHORT[d]).join(', ')
}
