import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRhythm, RHYTHM_DAYS } from './rhythm'

const TODAY = '2026-10-22'
const done = (date: string, minute: number, plannedMinute: number | null = null) => ({ kind: 'done' as const, date, minute, plannedMinute })

test('two weeks, oldest first, ending today', () => {
  const r = buildRhythm({ today: TODAY, signals: [], planned: null, usual: null })
  assert.equal(r.days.length, RHYTHM_DAYS)
  assert.equal(r.days[0].date, '2026-10-09')
  assert.equal(r.days.at(-1)!.date, TODAY)
  assert.equal(r.doneDays, 0)
})

test('one point a day; what was said beats a tick, whatever the order', () => {
  const r = buildRhythm({
    today: TODAY,
    signals: [
      { kind: 'reported', date: '2026-10-21', minute: 19 * 60, plannedMinute: null },
      done('2026-10-21', 22 * 60),
      done('2026-10-20', 18 * 60),
      done('2026-10-20', 18 * 60 + 30),
    ],
    planned: null,
    usual: null,
  })
  const at = (date: string) => r.days.find((d) => d.date === date)!.minute
  assert.equal(at('2026-10-21'), 19 * 60)
  assert.equal(at('2026-10-20'), 18 * 60 + 30)
  assert.equal(r.doneDays, 2)
})

test('outside the window, skipped, and timeless signals are left out', () => {
  const r = buildRhythm({
    today: TODAY,
    signals: [
      done('2026-10-01', 600),
      { kind: 'skipped', date: '2026-10-21', minute: 600, plannedMinute: null },
      { kind: 'done', date: '2026-10-20', minute: null, plannedMinute: null },
    ],
    planned: null,
    usual: null,
  })
  assert.equal(r.doneDays, 0)
})

test('planned: today’s slot first, else where it was planned lately', () => {
  const signals = [done('2026-10-20', 1150, 420), done('2026-10-21', 1160, 420), done('2026-10-19', 1140, 480)]
  assert.equal(buildRhythm({ today: TODAY, signals, planned: 600, usual: null }).planned, 600)
  assert.equal(buildRhythm({ today: TODAY, signals, planned: null, usual: null }).planned, 420)
  assert.equal(buildRhythm({ today: TODAY, signals: [done('2026-10-20', 1150)], planned: null, usual: null }).planned, null)
})
