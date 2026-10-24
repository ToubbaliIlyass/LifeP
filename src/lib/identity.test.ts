import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Edge, Node } from '@/lib/db/schema'
import { collectVotes, nextHue, tally, type Identity, type Vote } from './identity'
import { cityLayout, pathLayout, skyLayout, skyMilestone, spiral, STRIDE } from './world-layout'

const TODAY = '2026-10-22'
let nid = 1
const node = (type: string, properties: Record<string, unknown>, id = nid++): Node =>
  ({ id, userId: 1, type, properties, createdAt: '2026-10-01 10:00:00', updatedAt: '2026-10-01 10:00:00' }) as Node
const edge = (sourceId: number, targetId: number): Edge =>
  ({ id: nid++, userId: 1, sourceId, targetId, type: 'part-of', properties: {}, createdAt: '' }) as Edge
const identity = (id: number, patch: Partial<Identity> = {}): Identity =>
  ({ id, name: `#${id}`, hue: 0, listIds: [], itemIds: [], tags: [], order: id, ...patch })

test('finished tasks and kept habit days are votes; open ones are not', () => {
  const habit = node('Habit', { name: 'Run' })
  const nodes = [
    node('Task', { status: 'done', completedAt: '2026-10-20T09:00:00.000Z' }),
    node('Task', { status: 'todo' }),
    habit,
    node('HabitLog', { habitNodeId: habit.id, date: '2026-10-21', completed: true }),
    node('HabitLog', { habitNodeId: habit.id, date: '2026-10-19', completed: false }),
  ]
  const votes = collectVotes({ nodes, edges: [], identities: [], today: TODAY, zone: 'UTC' })
  assert.deepEqual(votes, [[2, -1], [1, -1]])
})

test('the day a task was finished is the user’s day, not UTC’s', () => {
  const nodes = [node('Task', { status: 'done', completedAt: '2026-10-21T23:30:00.000Z' })]
  assert.deepEqual(collectVotes({ nodes, edges: [], identities: [], today: TODAY, zone: 'Asia/Tokyo' }), [[0, -1]])
  assert.deepEqual(collectVotes({ nodes, edges: [], identities: [], today: TODAY, zone: 'UTC' }), [[1, -1]])
})

test('each of the five prayers is its own vote', () => {
  const nodes = [node('HabitLog', { habitNodeId: 999, date: TODAY, prayers: ['fajr', 'dhuhr', 'asr'] })]
  assert.equal(collectVotes({ nodes, edges: [], identities: [], today: TODAY, zone: null }).length, 3)
})

test('the most specific link decides: the item, its project, the project’s area, then tags', () => {
  const area = node('Goal', { name: 'Health' })
  const project = node('Project', { name: 'Marathon' })
  const inProject = node('Task', { status: 'done', completedAt: '2026-10-22T08:00:00Z' })
  const tagged = node('Task', { status: 'done', completedAt: '2026-10-22T08:00:00Z', tags: ['Writing'] })
  const named = node('Task', { status: 'done', completedAt: '2026-10-22T08:00:00Z', seriesId: 4242 })
  const edges = [edge(project.id, area.id), edge(inProject.id, project.id)]
  const ids = [
    identity(10, { listIds: [area.id] }),
    identity(11, { tags: ['writing'] }),
    identity(12, { itemIds: [4242] }),
  ]
  const votes = collectVotes({ nodes: [area, project, inProject, tagged, named], edges, identities: ids, today: TODAY, zone: 'UTC' })
  assert.deepEqual(votes.map((v) => v[1]), [0, 1, 2])
})

test('tally counts all time and the last seven days, the everyday last', () => {
  const votes: Vote[] = [[30, 0], [6, 0], [0, -1], [8, -1]]
  const t = tally([identity(1)], votes)
  assert.equal(t.identities[0].votes, 2)
  assert.equal(t.identities[0].week, 1)
  assert.deepEqual(t.everyday, { votes: 2, week: 1 })
})

test('a new identity gets a colour nobody is wearing', () => {
  assert.equal(nextHue([{ hue: 0 }, { hue: 2 }]), 1)
})

const many = (n: number, groups: number): Vote[] => Array.from({ length: n }, (_, i) => [n - i, i % (groups + 1) === groups ? -1 : i % (groups + 1)])

test('every world has a place for every vote, and the same one every time', () => {
  const votes = many(400, 3)
  const seeds = [7, 8, 9]
  const sky = skyLayout(votes, 3, seeds)
  const path = pathLayout(votes, seeds)
  const city = cityLayout(votes, 3, seeds)
  assert.equal(sky.stars.length, 400)
  assert.equal(path.stones.length, 400)
  assert.equal(city.floors.length, 400)
  assert.deepEqual(skyLayout(votes, 3, seeds).stars[123], sky.stars[123])
  assert.deepEqual(cityLayout(votes, 3, seeds).floors[321], city.floors[321])
  for (const s of sky.stars) assert.ok(s.p.every(Number.isFinite))
})

test('sky: a constellation’s bright stars come at its milestones, joined into one figure', () => {
  const votes: Vote[] = Array.from({ length: 60 }, () => [0, 0])
  const sky = skyLayout(votes, 1, [1])
  const bright = sky.stars.filter((s) => s.bright).length
  let expected = 0
  while (skyMilestone(expected) <= 60) expected++
  assert.equal(bright, expected)
  // A tree: one line fewer than stars.
  assert.equal(sky.lines.length, bright - 1)
  assert.equal(sky.labels.length, 1)
})

test('path: one stride a step, laid ahead of today', () => {
  const path = pathLayout(many(10, 1))
  const [a, b] = [path.stones[3].p, path.stones[4].p]
  assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) < STRIDE + 0.5)
  assert.ok(path.line.length / 2 * 0.25 > path.end)
})

test('city: buildings rise floor by floor, and a crowded district takes the next block', () => {
  const city = cityLayout(Array.from({ length: 30 }, () => [0, 0] as Vote), 1, [1])
  const first = city.floors.filter((f) => f.building === 0)
  first.forEach((f, i) => assert.ok(Math.abs(f.p[1] - (i + 0.5) * 0.42) < 1e-9))
  assert.equal(city.blocks.length, 1)
  const big = cityLayout(Array.from({ length: 2000 }, () => [0, 0] as Vote), 1, [1])
  assert.ok(big.blocks.length > 1)
  assert.deepEqual(spiral(3), [[1, 0], [1, 1], [0, 1]])
})
