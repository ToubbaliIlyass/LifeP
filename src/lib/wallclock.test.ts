import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setClockZone, wallNow, clockZone, FIXED_ZONES } from './wallclock'

const at = new Date(Date.UTC(2026, 8, 28, 19, 24))

test('unpinned, the wall clock is the plain clock', () => {
  setClockZone(null)
  assert.equal(wallNow(at).getTime(), at.getTime())
})

test('pinned to UTC+0, the wall reads UTC whatever the machine thinks', () => {
  // This is Morocco after going back to UTC+0, on a browser whose own zone
  // data still says UTC+1.
  setClockZone('Etc/UTC')
  const wall = wallNow(at)
  assert.equal(wall.getHours(), 19)
  assert.equal(wall.getMinutes(), 24)
  assert.equal(wall.getDate(), 28)
  assert.equal(clockZone(), 'Etc/UTC')
  setClockZone(null)
})

test('a fixed offset crosses midnight correctly', () => {
  setClockZone('Etc/GMT-5') // UTC+5
  const wall = wallNow(new Date(Date.UTC(2026, 8, 28, 22, 0)))
  assert.equal(wall.getDate(), 29)
  assert.equal(wall.getHours(), 3)
  setClockZone(null)
})

test('nonsense is ignored rather than breaking the clock', () => {
  setClockZone('Not/AZone')
  assert.equal(wallNow(at).getTime(), at.getTime())
})

test('the offsets read the right way round', () => {
  assert.deepEqual(FIXED_ZONES.find((z) => z.label === 'UTC+1'), { zone: 'Etc/GMT-1', label: 'UTC+1' })
  assert.deepEqual(FIXED_ZONES.find((z) => z.label === 'UTC+0'), { zone: 'Etc/UTC', label: 'UTC+0' })
})
