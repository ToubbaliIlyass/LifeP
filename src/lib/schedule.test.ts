import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSchedule, toMinutes, MIN_CHUNK_MINUTES, type SchedulableTask, type BusyInterval } from './schedule'

const DAY = { start: '08:00', end: '20:00' }
const t = (id: number, minutes: number, extra: Partial<SchedulableTask> = {}): SchedulableTask => ({
  id, name: `item ${id}`, dueDate: '2026-09-28', priority: 'medium', minutes, kind: 'task', ...extra,
})
const at = (start: string, end: string): BusyInterval => ({ start: toMinutes(start), end: toMinutes(end) })

/** Every placement inside the day, clear of busy time, and clear of each other. */
function assertSound(result: ReturnType<typeof planSchedule>, busy: BusyInterval[], day = DAY, floor = 0) {
  const spans = result.placements.map((p) => ({ start: toMinutes(p.startTime), end: toMinutes(p.endTime), p }))
  for (const s of spans) {
    assert.ok(s.start >= Math.max(toMinutes(day.start), floor), `${s.p.name} starts before the day: ${s.p.startTime}`)
    assert.ok(s.end <= toMinutes(day.end), `${s.p.name} runs past the day: ${s.p.endTime}`)
    assert.equal(s.end - s.start, s.p.minutes)
    for (const b of busy) {
      if (b.end <= b.start) continue
      assert.ok(s.end <= b.start || s.start >= b.end, `${s.p.name} ${s.p.startTime} overlaps busy time`)
    }
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i], b = spans[j]
      assert.ok(a.end <= b.start || b.end <= a.start, `${a.p.name} and ${b.p.name} overlap`)
    }
  }
}

test('places around busy time, in time order', () => {
  const busy = [at('08:00', '10:00')]
  const r = planSchedule({ tasks: [t(1, 30), t(2, 45)], busy, workingHours: DAY })
  assert.deepEqual(r.placements.map((p) => p.startTime), ['10:00', '10:30'])
  assert.equal(r.unplaced.length, 0)
  assertSound(r, busy)
})

test('one thing that does not fit no longer ends the plan', () => {
  // Only a 60-minute hole. The 3-hour task sorts first (earlier due date)
  // and used to `break` the loop, dropping the short items behind it.
  const busy = [at('08:00', '12:00'), at('13:00', '20:00')]
  const r = planSchedule({
    tasks: [t(1, 180, { dueDate: '2026-09-20' }), t(2, 20), t(3, 15, { kind: 'habit', dueDate: null })],
    busy, workingHours: DAY,
  })
  assert.deepEqual(r.placements.map((p) => p.taskId).sort(), [2, 3])
  assert.equal(r.unplaced.length, 1)
  assert.equal(r.unplaced[0].taskId, 1)
  assert.match(r.unplaced[0].reason, /needs 180 min, longest free stretch is 60/)
  assertSound(r, busy)
})

test('a hole the plan has already walked past is still used', () => {
  // A gap of 60 min forces the cursor past the 08:00-08:30 hole; a later
  // 30-minute item must still be able to go back and use it.
  const busy = [at('08:30', '09:00'), at('09:30', '20:00')]
  const r = planSchedule({ tasks: [t(1, 30), t(2, 30)], busy, workingHours: DAY, gapMinutes: 60 })
  assert.equal(r.placements.length, 2)
  assert.equal(r.unplaced.length, 0)
  assertSound(r, busy)
})

test('a task too long for any gap is split into sittings', () => {
  const busy = [at('09:00', '10:00'), at('11:00', '12:00'), at('13:00', '20:00')]
  // 08:00-09:00, 10:00-11:00, 12:00-13:00 free: 120 min fits as two or three pieces.
  const r = planSchedule({ tasks: [t(1, 120)], busy, workingHours: DAY })
  assert.equal(r.unplaced.length, 0)
  const total = r.placements.reduce((sum, p) => sum + p.minutes, 0)
  assert.equal(total, 120)
  assert.ok(r.placements.length >= 2)
  for (const p of r.placements) {
    assert.equal(p.taskId, 1)
    assert.ok(p.minutes >= MIN_CHUNK_MINUTES, `piece of ${p.minutes} min`)
    assert.match(p.reason, /part \d of \d/)
  }
  assertSound(r, busy)
})

test('splitting is all or nothing', () => {
  const busy = [at('08:45', '20:00')]
  // 45 free minutes cannot hold 120, so nothing of it is placed.
  const r = planSchedule({ tasks: [t(1, 120)], busy, workingHours: DAY })
  assert.equal(r.placements.length, 0)
  assert.equal(r.unplaced[0].taskId, 1)
})

test('habits are never split', () => {
  const busy = [at('08:40', '09:00'), at('09:40', '20:00')]
  const r = planSchedule({ tasks: [t(1, 60, { kind: 'habit', dueDate: null })], busy, workingHours: DAY })
  assert.equal(r.placements.length, 0)
  assert.equal(r.unplaced.length, 1)
})

test('a part of the day is a hard edge, and a full one is named', () => {
  const evening = { window: at('18:00', '20:00'), windowName: 'Evening' }
  const busy = [at('18:00', '20:00')]
  const r = planSchedule({ tasks: [t(1, 30, evening)], busy, workingHours: DAY })
  assert.equal(r.placements.length, 0)
  assert.match(r.unplaced[0].reason, /evening is full/)

  const open = planSchedule({ tasks: [t(1, 30, evening)], busy: [], workingHours: DAY })
  assert.equal(open.placements[0].startTime, '18:00')
})

test('the hours already gone are not offered', () => {
  const r = planSchedule({ tasks: [t(1, 30)], busy: [], workingHours: DAY, earliestMinutes: toMinutes('14:10') })
  assert.equal(r.placements[0].startTime, '14:10')
  const late = planSchedule({ tasks: [t(1, 30)], busy: [], workingHours: DAY, earliestMinutes: toMinutes('20:00') })
  assert.equal(late.placements.length, 0)
  assert.match(late.unplaced[0].reason, /already over/)
})

test('busy time across midnight blocks the rest of the evening', () => {
  const busy = [at('08:00', '19:00'), { start: toMinutes('19:30'), end: toMinutes('01:00') }]
  const r = planSchedule({ tasks: [t(1, 45)], busy, workingHours: DAY })
  assert.equal(r.placements.length, 0)
})

test('unreadable input does not become free time or a crash', () => {
  const busy = [{ start: NaN, end: 600 }, at('08:00', '09:00')]
  const r = planSchedule({
    tasks: [t(1, NaN), t(2, 0, { kind: 'habit', dueDate: null }), t(3, -20)],
    busy,
    workingHours: { start: 'nonsense', end: '' },
  })
  assert.equal(r.placements.length, 3)
  for (const p of r.placements) assert.ok(p.minutes > 0)
  // The readable busy block still holds.
  assertSound(r, [at('08:00', '09:00')], { start: '07:00', end: '23:00' })
})

test('a usual time is kept, and moved only when taken', () => {
  const usual = { kind: 'habit' as const, dueDate: null, preferredStart: toMinutes('18:30') }
  const free = planSchedule({ tasks: [t(1, 20, usual)], busy: [], workingHours: DAY })
  assert.equal(free.placements[0].startTime, '18:30')
  assert.match(free.placements[0].reason, /your usual time/)

  const taken = planSchedule({ tasks: [t(1, 20, usual)], busy: [at('18:00', '19:00')], workingHours: DAY })
  assert.notEqual(taken.placements[0].startTime, '18:30')
  assert.doesNotMatch(taken.placements[0].reason, /your usual time/)
})

test('work pulled forward only takes what is left, and is never reported missing', () => {
  const busy = [at('08:30', '20:00')]
  const r = planSchedule({
    tasks: [t(1, 30, { optional: true, dueDate: '2026-09-30' }), t(2, 30)],
    busy, workingHours: DAY,
  })
  assert.deepEqual(r.placements.map((p) => p.taskId), [2])
  assert.equal(r.unplaced.length, 0)
})

test('due first, then priority', () => {
  const r = planSchedule({
    tasks: [
      t(1, 30, { dueDate: '2026-09-28', priority: 'low' }),
      t(2, 30, { dueDate: '2026-09-28', priority: 'high' }),
      t(3, 30, { dueDate: '2026-09-25', priority: 'low' }),
    ],
    busy: [], workingHours: DAY,
  })
  assert.deepEqual(r.placements.map((p) => p.taskId), [3, 2, 1])
})

test('never double-books, whatever the day looks like', () => {
  // A small deterministic generator, so a failure can be replayed.
  let seed = 42
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const pick = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))

  for (let round = 0; round < 300; round++) {
    const busy = Array.from({ length: pick(0, 6) }, () => {
      const start = pick(8 * 60, 19 * 60)
      return { start, end: start + pick(10, 180) }
    })
    const tasks = Array.from({ length: pick(1, 10) }, (_, i) => t(i + 1, pick(5, 200), {
      kind: rand() < 0.3 ? 'habit' : 'task',
      priority: ['high', 'medium', 'low'][pick(0, 2)],
      preferredStart: rand() < 0.2 ? pick(8 * 60, 19 * 60) : null,
      optional: rand() < 0.15,
    }))
    const floor = rand() < 0.3 ? pick(8 * 60, 18 * 60) : undefined
    const r = planSchedule({ tasks, busy, workingHours: DAY, earliestMinutes: floor, gapMinutes: pick(0, 30) })
    assertSound(r, busy, DAY, floor ?? 0)

    // Everything is accounted for: placed in full, or reported, or optional.
    for (const task of tasks) {
      const placed = r.placements.filter((p) => p.taskId === task.id).reduce((s, p) => s + p.minutes, 0)
      const reported = r.unplaced.some((u) => u.taskId === task.id)
      if (placed > 0) assert.equal(placed, task.minutes, `task ${task.id} placed in part`)
      else assert.ok(reported || task.optional, `task ${task.id} vanished`)
    }
  }
})
