import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanWeek, cleanWhen, cleanWho } from './onboarding-speech'

test('week: drops items that cannot be placed and repairs lengths', () => {
  const out = cleanWeek([
    { name: 'Lecture.', days: [1, 3, 3, 9], time: '10:00', minutes: 5000 },
    { name: 'No time', days: [1], time: '25:00', minutes: 60 },
    { name: 'No day', days: [], time: '09:00', minutes: 60 },
    { name: 'Lecture', days: [1, 3], time: '10:00', minutes: 90 },
  ])
  assert.deepEqual(out, [{ name: 'Lecture', days: [1, 3], time: '10:00', minutes: 60 }])
})

test('who: trims lead-ins and repeats', () => {
  assert.deepEqual(cleanWho([{ name: 'I’m becoming a runner.' }, { name: 'A Runner' }, { name: '' }]), [{ name: 'a runner' }])
})

test('when: a preference needs an activity and a real window', () => {
  const out = cleanWhen([
    { kind: 'prefer', activity: 'work out', days: [], start: '06:00', end: '09:00' },
    { kind: 'prefer', activity: '', days: [], start: '06:00', end: '09:00' },
    { kind: 'busy', activity: '', days: [0], start: '22:00', end: '08:00' },
    { kind: 'busy', activity: '', days: [0], start: '00:00', end: '08:00' },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].activity, 'work out')
  assert.equal(out[1].kind, 'busy')
})
