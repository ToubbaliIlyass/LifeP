import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archiveCutoff, finishedDay, isArchived, planArchive } from './archive'
import type { Edge, Node } from './db/schema'

const TODAY = '2026-11-12'
let nextId = 1
const node = (type: string, properties: Record<string, unknown>): Node => ({
  id: nextId++, userId: 1, type, properties, createdAt: '2026-01-01 08:00:00', updatedAt: '2026-11-11T09:00:00.000Z',
})
const edge = (sourceId: number, targetId: number): Edge => ({
  id: nextId++, userId: 1, sourceId, targetId, type: 'part-of', properties: {}, createdAt: '2026-01-01 08:00:00',
})
const done = (completedAt: string, extra: Record<string, unknown> = {}) => ({ name: 'x', status: 'done', completedAt, ...extra })

test('the cutoff is thirty days back', () => {
  assert.equal(archiveCutoff(TODAY), '2026-10-13')
})

test('a to-do finished more than a month ago is archived; a recent one is not', () => {
  const old = node('Task', done('2026-09-01T10:00:00.000Z'))
  const recent = node('Task', done('2026-11-01T10:00:00.000Z'))
  const edge13 = node('Task', done('2026-10-12T23:00:00.000Z'))
  const onCutoff = node('Task', done('2026-10-13T01:00:00.000Z'))
  assert.deepEqual(planArchive({ nodes: [old, recent, edge13, onCutoff], edges: [], today: TODAY }), [old.id, edge13.id])
})

test('open work is never archived, however old', () => {
  const open = node('Task', { name: 'Old but open', status: 'todo', completedAt: '2026-01-01T00:00:00.000Z' })
  assert.deepEqual(planArchive({ nodes: [open], edges: [], today: TODAY }), [])
})

test('with no completion time it goes by when it was last touched', () => {
  const n = node('Task', { name: 'x', status: 'done' })
  n.updatedAt = '2026-08-01T00:00:00.000Z'
  assert.equal(finishedDay(n), '2026-08-01')
  assert.deepEqual(planArchive({ nodes: [n], edges: [], today: TODAY }), [n.id])
})

test('a finished to-do in a project that is still going stays, so progress is not thrown off', () => {
  const project = node('Project', { name: 'Thesis', status: 'active' })
  const chapter = node('Task', done('2026-08-01T10:00:00.000Z'))
  assert.deepEqual(planArchive({ nodes: [project, chapter], edges: [edge(chapter.id, project.id)], today: TODAY }), [])
})

test('a finished project and its finished to-dos go together', () => {
  const project = node('Project', done('2026-08-05T10:00:00.000Z', { status: 'completed' }))
  const a = node('Task', done('2026-08-01T10:00:00.000Z'))
  const b = node('Task', done('2026-08-04T10:00:00.000Z'))
  const plan = planArchive({ nodes: [project, a, b], edges: [edge(a.id, project.id), edge(b.id, project.id)], today: TODAY })
  assert.deepEqual(new Set(plan), new Set([project.id, a.id, b.id]))
})

test('a finished project that is still recent keeps its to-dos in the Logbook', () => {
  const project = node('Project', done('2026-11-05T10:00:00.000Z', { status: 'completed' }))
  const a = node('Task', done('2026-08-01T10:00:00.000Z'))
  assert.deepEqual(planArchive({ nodes: [project, a], edges: [edge(a.id, project.id)], today: TODAY }), [])
})

test('a to-do in an area, not a project, goes on its own', () => {
  const area = node('Goal', { name: 'Health' })
  const t = node('Task', done('2026-08-01T10:00:00.000Z'))
  assert.deepEqual(planArchive({ nodes: [area, t], edges: [edge(t.id, area.id)], today: TODAY }), [t.id])
})

test('prayers, the already archived and the put back are left alone', () => {
  const prayer = node('Task', done('2026-08-01T10:00:00.000Z', { prayer: 'fajr' }))
  const archived = node('Task', done('2026-08-01T10:00:00.000Z', { archivedAt: '2026-11-01T00:00:00.000Z' }))
  const kept = node('Task', done('2026-08-01T10:00:00.000Z', { archiveKeep: true }))
  assert.equal(isArchived(archived), true)
  assert.deepEqual(planArchive({ nodes: [prayer, archived, kept], edges: [], today: TODAY }), [])
})
