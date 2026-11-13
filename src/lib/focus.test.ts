import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockText, firstStart, focusedMs, isRunning, pauseFocus, sessionsOf, spentText, startFocus } from './focus'

const t = (hhmm: string, sec = 0) => `2026-11-13T${hhmm}:${String(sec).padStart(2, '0')}.000Z`

test('start, pause, resume and stop keep one stretch per sitting', () => {
  let s = startFocus([], t('09:00'))
  assert.equal(isRunning(s), true)
  assert.equal(startFocus(s, t('09:05')).length, 1, 'starting twice changes nothing')
  s = pauseFocus(s, t('09:30'))
  assert.equal(isRunning(s), false)
  assert.equal(pauseFocus(s, t('09:40')).length, 1, 'pausing twice changes nothing')
  s = startFocus(s, t('10:00'))
  s = pauseFocus(s, t('10:15'))
  assert.deepEqual(s, [{ start: t('09:00'), end: t('09:30') }, { start: t('10:00'), end: t('10:15') }])
  assert.equal(firstStart(s), t('09:00'))
})

test('the total is the stretches added up, a running one counted to now', () => {
  const s = [{ start: t('09:00'), end: t('09:30') }, { start: t('10:00') }]
  assert.equal(focusedMs(s, Date.parse(t('10:10'))), 40 * 60_000)
  assert.equal(focusedMs([], Date.now()), 0)
})

test('what was stored is cleaned: junk dropped, order kept, an old unstopped stretch ends where the next begins', () => {
  const s = sessionsOf([
    { start: t('10:00') },
    { start: 'not a date' },
    { start: t('09:00') },
    { nope: true },
    { start: t('09:30'), end: t('09:10') }, // ends before it began: treated as still open
  ])
  assert.deepEqual(s, [{ start: t('09:00'), end: t('09:30') }, { start: t('09:30'), end: t('10:00') }, { start: t('10:00') }])
  assert.deepEqual(sessionsOf(undefined), [])
  assert.deepEqual(sessionsOf('x'), [])
})

test('a pause stamped before the start cannot make a negative stretch', () => {
  const s = pauseFocus([{ start: t('09:00') }], t('08:00'))
  assert.equal(focusedMs(s, Date.now()), 0)
})

test('the clock reads as a person would', () => {
  assert.equal(clockText(5 * 60_000 + 9_000), '5:09')
  assert.equal(clockText(3600_000 + 5 * 60_000 + 9_000), '1:05:09')
  assert.equal(clockText(-5), '0:00')
  assert.equal(spentText(20_000), 'under a minute')
  assert.equal(spentText(12 * 60_000), '12 min')
  assert.equal(spentText(65 * 60_000), '1 h 5 min')
  assert.equal(spentText(120 * 60_000), '2 h')
})
