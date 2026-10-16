import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEntry } from './quick-entry'

const TODAY = '2026-10-15' // a Thursday

test('reads every kind of piece', () => {
  const e = parseEntry('todo review ML notes do tomorrow due fri at 9am for 45m #school !! every day x3 /AUI', TODAY)!
  assert.equal(e.kind, 'todo')
  assert.equal(e.title, 'review ML notes')
  assert.equal(e.when, '2026-10-16')
  assert.equal(e.time, '09:00')
  assert.equal(e.minutes, 45)
  assert.deepEqual(e.tags, ['school'])
  assert.equal(e.priority, 'high')
  assert.equal(e.repeats, 'daily')
  // Three times from Friday is Friday, Saturday, Sunday — earlier than the deadline, so it wins.
  assert.equal(e.until, '2026-10-18')
  assert.equal(e.deadline, '2026-10-16')
  assert.equal(e.list, 'AUI')
})

test('an event with days, a length in words and a place', () => {
  const e = parseEntry('event: Compilers lecture every tue and thu at 10:00 for an hour @B12', TODAY)!
  assert.equal(e.kind, 'event')
  assert.equal(e.title, 'Compilers lecture')
  assert.equal(e.repeats, 'weekly')
  assert.deepEqual(e.repeatDays, [2, 4])
  assert.equal(e.when, '2026-10-15') // today is a Thursday, so it starts today
  assert.equal(e.time, '10:00')
  assert.equal(e.minutes, 60)
  assert.equal(e.location, 'B12')
})

test('plain sentences still work, and ordinary words are left alone', () => {
  const plain = parseEntry('call the bank tomorrow 3pm', TODAY)!
  assert.equal(plain.title, 'call the bank')
  assert.equal(plain.when, '2026-10-16')
  assert.equal(plain.time, '15:00')

  for (const text of ['buy 2 eggs', 'read for fun', 'meet at the station', 'do the dishes']) {
    assert.equal(parseEntry(text, TODAY)!.title, text, text)
  }
  // A bare first word is read as the kind — the preview says so, and offers to keep the words.
  assert.equal(parseEntry('event planning with Sara', TODAY)!.kind, 'event')
  assert.equal(parseEntry('buy 2 eggs', TODAY)!.minutes, null)
  assert.equal(parseEntry('read for fun', TODAY)!.title, 'read for fun')
  assert.equal(parseEntry('meet at the station', TODAY)!.time, null)
  assert.equal(parseEntry('do the dishes', TODAY)!.title, 'do the dishes')
})

test('until and counts end a repeat', () => {
  assert.equal(parseEntry('stretch every weekday until next week', TODAY)?.repeats, 'weekdays')
  const w = parseEntry('water plants every mon x2', TODAY)!
  assert.equal(w.when, '2026-10-19')
  assert.equal(w.until, '2026-10-26')
})
