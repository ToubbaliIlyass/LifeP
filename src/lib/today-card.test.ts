import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Todo } from '@/lib/todos'
import { awayKey, pickTodayCard, sundayOf } from './today-card'

const todo = (over: Partial<Todo>): Todo => ({
  id: 1, type: 'Task', title: 'x', notes: '', when: '2026-10-27', evening: false, someday: false, deadline: null, time: null,
  timePlanned: false, minutes: null, tags: [], checklist: [], listId: null, headingId: null, done: false, doneAt: null,
  order: 0, repeats: null, repeatDays: null, reminder: null, priority: null, ...over,
})
const TUE = '2026-10-27'
const SUN = '2026-11-01'
const at = (day: string, h: number) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`)
const none = () => false
const slipped = Array.from({ length: 4 }, (_, i) => todo({ id: i + 1, when: '2026-10-25' }))
const pick = (day: string, h: number, todos: Todo[], away: (k: string) => boolean = none) =>
  pickTodayCard({ now: at(day, h), date: day, todos, lists: [], events: [], away })

test('an ordinary day has no card at all', () => {
  assert.equal(pick(TUE, 15, [todo({})]), null)
})

test('a bad Sunday evening gets one message, in a fixed order, never a stack', () => {
  // Slipped pile, Sunday after 16:00, and after 20:00: all three are due. One shows.
  assert.equal(pick(SUN, 21, slipped)?.kind, 'catch-up')
  assert.equal(pick(SUN, 21, slipped, (k) => k === awayKey.catchUp(SUN))?.kind, 'week')
  assert.equal(pick(SUN, 21, slipped, (k) => k === awayKey.catchUp(SUN) || k === awayKey.week(SUN))?.kind, 'check-in')
  assert.equal(pick(SUN, 21, slipped, () => true), null)
})

test('the evening question waits for the evening, and the week for its window', () => {
  assert.equal(pick(TUE, 19, [todo({})]), null)
  assert.equal(pick(TUE, 20, [todo({})])?.kind, 'check-in')
  assert.equal(pick(SUN, 15, [todo({})]), null)
  assert.equal(pick(SUN, 16, [todo({})])?.kind, 'week')
  assert.equal(sundayOf('2026-11-02'), SUN)
  assert.equal(sundayOf(SUN), SUN)
})

test('the offer of help comes last, and a put-away one stays away', () => {
  const old = [todo({ id: 7, when: '2026-10-10' })]
  const c = pick(TUE, 14, old)
  assert.equal(c?.kind, 'help')
  assert.equal(pick(TUE, 14, old, (k) => c?.kind === 'help' && k === awayKey.help(TUE, c.mood.key)), null)
  // The evening question outranks it.
  assert.equal(pick(TUE, 21, old)?.kind, 'check-in')
})
