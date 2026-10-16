import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockIn, zoneFor } from './clock'

// 23:30 UTC on 27 Sep 2026.
const lateUtc = new Date(Date.UTC(2026, 8, 27, 23, 30))

test('the time is the user\'s, not the server\'s', () => {
  assert.deepEqual(clockIn('UTC', lateUtc), { date: '2026-09-27', minutes: 23 * 60 + 30, zone: 'UTC' })
  // Morocco is an hour ahead in September: already tomorrow there.
  assert.deepEqual(clockIn('Africa/Casablanca', lateUtc), { date: '2026-09-28', minutes: 30, zone: 'Africa/Casablanca' })
  assert.deepEqual(clockIn('America/New_York', lateUtc), { date: '2026-09-27', minutes: 19 * 60 + 30, zone: 'America/New_York' })
})

test('an unknown zone falls back instead of throwing', () => {
  const r = clockIn('Not/AZone', lateUtc)
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(r.minutes >= 0 && r.minutes < 1440)
})

test('the browser\'s zone wins, then the saved one', () => {
  assert.equal(zoneFor('Europe/Paris', 'Africa/Casablanca'), 'Europe/Paris')
  assert.equal(zoneFor('garbage', 'Africa/Casablanca'), 'Africa/Casablanca')
  assert.equal(zoneFor(undefined, null), null)
  // Pinned in Settings beats both: the browser's own zone data can be stale.
  assert.equal(zoneFor('Africa/Casablanca', 'Africa/Casablanca', 'Etc/UTC'), 'Etc/UTC')
  assert.equal(zoneFor('Africa/Casablanca', null, 'nonsense'), 'Africa/Casablanca')
})
