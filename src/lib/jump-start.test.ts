import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWhen } from './jump-start'

const TODAY = '2026-10-14' // a Wednesday

test('reads days the way they are said', () => {
  const cases: [string, string | null, Partial<{ evening: boolean; someday: boolean; reminder: string | null }>?][] = [
    ['today', TODAY],
    ['tod', TODAY],
    ['tom', '2026-10-15'],
    ['tomorrow', '2026-10-15'],
    ['tonight', TODAY, { evening: true }],
    ['sat', '2026-10-17'],
    ['saturday', '2026-10-17'],
    ['wed', '2026-10-21', {}], // the next Wednesday, never today itself
    ['in 4 days', '2026-10-18'],
    ['in four days', '2026-10-18'],
    ['in 2 weeks', '2026-10-28'],
    ['aug 1', '2027-08-01'], // already gone this year
    ['1 nov', '2026-11-01'],
    ['december 25th', '2026-12-25'],
    ['2026-11-30', '2026-11-30'],
    ['some', null, { someday: true }],
    ['wed 8pm', '2026-10-21', { reminder: '20:00' }],
    ['tom at 9:30am', '2026-10-15', { reminder: '09:30' }],
    ['5pm', TODAY, { reminder: '17:00' }],
  ]
  for (const [input, when, extra] of cases) {
    const got = parseWhen(input, TODAY)
    assert.ok(got, `"${input}" was not understood`)
    assert.equal(got.when, when, `"${input}"`)
    if (extra?.evening) assert.equal(got.evening, true, `"${input}" evening`)
    if (extra?.someday) assert.equal(got.someday, true, `"${input}" someday`)
    if (extra?.reminder !== undefined) assert.equal(got.reminder, extra.reminder, `"${input}" reminder`)
  }
})

test('says what it understood, and nothing for nonsense', () => {
  assert.equal(parseWhen('fri 7pm', TODAY)?.label, 'Friday at 19:00')
  assert.equal(parseWhen('blorp', TODAY), null)
  assert.equal(parseWhen('', TODAY), null)
})

import { splitWhen } from './jump-start'

test('takes the day and time off the end of a title', () => {
  const cases: [string, string, string | null, string | null][] = [
    ['Dentist fri 3pm', 'Dentist', '2026-10-16', '15:00'],
    ['call the bank tomorrow', 'call the bank', '2026-10-15', null],
    ['Lecture on Monday at 10:30', 'Lecture', '2026-10-19', '10:30'],
    ['pay rent in 3 days', 'pay rent', '2026-10-17', null],
    ['team meeting at 9am', 'team meeting', '2026-10-14', '09:00'],
    ['flight dec 20', 'flight', '2026-12-20', null],
  ]
  for (const [input, title, when, time] of cases) {
    const got = splitWhen(input, '2026-10-14')
    assert.ok(got, `"${input}" was not split`)
    assert.equal(got.title, title, `"${input}" title`)
    assert.equal(got.guess.when, when, `"${input}" day`)
    assert.equal(got.guess.reminder, time, `"${input}" time`)
  }
})

test('leaves ordinary titles alone', () => {
  for (const input of ['call Tom', 'read on', 'buy 2 eggs', 'Sat essay', 'tomorrow', 'fix the sun visor', 'go to march']) {
    assert.equal(splitWhen(input, '2026-10-14'), null, `"${input}" should stay as typed`)
  }
})
