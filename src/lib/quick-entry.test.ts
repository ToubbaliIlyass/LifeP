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

test('a start, an end and the day a repeat stops', () => {
  const line = 'Machine Learning Class from 11:30am till 12:50pm every mond, wed ending on december 11th'
  for (const head of ['event ', 'todo ', '']) {
    const e = parseEntry(head + line, TODAY)!
    assert.equal(e.title, 'Machine Learning Class')
    assert.equal(e.time, '11:30')
    assert.equal(e.endTime, '12:50')
    assert.equal(e.minutes, 80)
    assert.deepEqual(e.repeatDays, [1, 3])
    assert.equal(e.repeats, 'weekly')
    assert.equal(e.when, '2026-10-19') // the first Monday or Wednesday from a Thursday
    assert.equal(e.until, '2026-12-11')
  }
  assert.equal(parseEntry('todo ' + line, TODAY)!.deadline, '2026-12-11')
  assert.equal(parseEntry('event ' + line, TODAY)!.deadline, null)
})

test('ranges said in other ways', () => {
  const a = parseEntry('Lab 11:30am-12:50pm', TODAY)!
  assert.deepEqual([a.title, a.time, a.endTime, a.minutes], ['Lab', '11:30', '12:50', 80])
  const b = parseEntry('shift from 9 to 5', TODAY)!
  assert.deepEqual([b.title, b.time, b.endTime, b.minutes], ['shift', '09:00', '17:00', 480])
  const c = parseEntry('call at 2pm until 3:30pm tomorrow', TODAY)!
  assert.deepEqual([c.time, c.endTime, c.minutes, c.when], ['14:00', '15:30', 90, '2026-10-16'])
  const d = parseEntry('Seminar 9-10:30am', TODAY)!
  assert.deepEqual([d.time, d.endTime, d.minutes], ['09:00', '10:30', 90])
  assert.equal(parseEntry('yoga every day ends dec 20', TODAY)!.until, '2026-12-20')
})

test('ordinary words around ranges are left alone', () => {
  for (const text of ['work from home', 'drive to the airport', 'wait till spring', 'buy 2-3 eggs', 'read the ending of the book', 'move from 5 apples']) {
    const e = parseEntry(text, TODAY)!
    assert.equal(e.title, text, text)
    assert.equal(e.time, null, text)
    assert.equal(e.until, null, text)
  }
})
