import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/*
 * The write path, against a real throwaway database: approving a proposal
 * exactly once, taking a half-run batch back out, not merging a plan into
 * what the user already had, and undoing without touching their old things.
 * The database is a temp file chosen before anything imports the db client.
 */
const dir = mkdtempSync(join(tmpdir(), 'acture-exec-'))
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'test.db')}`
process.env.TURSO_AUTH_TOKEN = ''

type Mods = {
  db: typeof import('@/lib/db').db
  schema: typeof import('@/lib/db/schema')
  q: typeof import('@/lib/graph/queries')
  router: typeof import('@/lib/ai/router')
  props: typeof import('@/lib/db/proposals')
}
let m: Mods
let userId = 0

before(async () => {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(drizzle(createClient({ url: process.env.TURSO_DATABASE_URL! })), { migrationsFolder: join(process.cwd(), 'drizzle') })
  m = {
    db: (await import('@/lib/db')).db,
    schema: await import('@/lib/db/schema'),
    q: await import('@/lib/graph/queries'),
    router: await import('@/lib/ai/router'),
    props: await import('@/lib/db/proposals'),
  }
  userId = (await m.db.insert(m.schema.users).values({ name: 'T' }).returning().get()).id
})
after(() => rmSync(dir, { recursive: true, force: true }))

const count = async (type: string) => (await m.q.getNodes(userId, { type })).length

test('a proposal is claimed exactly once, even when two taps race', async () => {
  const p = await m.props.createProposal(userId, 'x', [])
  const [a, b] = await Promise.all([m.props.claimProposal(p.id, userId), m.props.claimProposal(p.id, userId)])
  assert.equal([a, b].filter(Boolean).length, 1)
  // Mid-run it cannot be rejected, and once finished it cannot be claimed again.
  assert.equal(await m.props.rejectProposal(p.id, userId, 'no'), undefined)
  await m.props.finishProposal(p.id, userId, { createdNodeIds: [] })
  assert.equal(await m.props.claimProposal(p.id, userId), undefined)
})

test('a rejected proposal cannot be approved', async () => {
  const p = await m.props.createProposal(userId, 'y', [])
  await m.props.rejectProposal(p.id, userId, 'no')
  assert.equal(await m.props.claimProposal(p.id, userId), undefined)
})

test('two to-dos with the same name are two to-dos', async () => {
  const before = await count('Task')
  const { result } = await m.router.executeBatch(userId, [
    { kind: 'createNode', type: 'Task', properties: { name: 'Long run', status: 'todo' } },
    { kind: 'createNode', type: 'Task', properties: { name: 'Long run', status: 'todo' } },
  ])
  assert.equal(result.createdNodeIds.length, 2)
  assert.equal(await count('Task'), before + 2)
})

test('a new project is not merged into a finished one of the same name', async () => {
  const old = await m.q.createNode(userId, 'Project', { name: 'Marathon', status: 'completed' })
  const { result } = await m.router.executeBatch(userId, [{ kind: 'createNode', type: 'Project', properties: { name: 'Marathon', status: 'active' } }])
  assert.equal(result.createdNodeIds.length, 1)
  assert.notEqual(result.createdNodeIds[0], old.id)
  // Taking it back leaves the old one alone.
  await m.router.rollbackBatch(userId, result)
  assert.ok(await m.q.getNodeById(userId, old.id))
})

test('an active project of the same name is reused, and undo never deletes it', async () => {
  const mine = await m.q.createNode(userId, 'Project', { name: 'Thesis', status: 'active' })
  const { result } = await m.router.executeBatch(userId, [
    { kind: 'createNode', type: 'Project', properties: { name: 'Thesis' } },
    { kind: 'createNode', type: 'Task', properties: { name: 'Outline' } },
    { kind: 'createEdge', sourceRef: '$1', targetRef: '$0', type: 'part-of' },
  ])
  assert.deepEqual(result.reusedNodeIds, [mine.id])
  assert.equal(result.createdNodeIds.length, 1)
  await m.router.rollbackBatch(userId, result)
  assert.ok(await m.q.getNodeById(userId, mine.id), 'the user’s own project survives')
  assert.equal((await m.q.getEdges(userId, { targetId: mine.id })).length, 0, 'but the link the batch made is gone')
})

test('a batch that fails partway leaves nothing behind once rolled back', async () => {
  const nodes = (await m.q.getNodes(userId)).length
  const edges = (await m.q.getEdges(userId)).length
  let caught: unknown
  try {
    await m.router.executeBatch(userId, [
      { kind: 'createNode', type: 'Project', properties: { name: 'Half' } },
      { kind: 'createNode', type: 'Task', properties: { name: 'Half step' } },
      { kind: 'createEdge', sourceRef: '$1', targetRef: '$0', type: 'part-of' },
      { kind: 'updateNode', nodeId: 999999, properties: { name: 'nope' } },
    ])
  } catch (error) {
    caught = error
  }
  assert.ok(caught instanceof m.router.BatchExecutionError, 'it fails as a batch error carrying what it had written')
  assert.equal(caught.partial.createdNodeIds.length, 2)
  assert.ok((await m.q.getNodes(userId)).length > nodes, 'the partial writes really are there before rollback')
  await m.router.rollbackBatch(userId, caught.partial)
  assert.equal((await m.q.getNodes(userId)).length, nodes)
  assert.equal((await m.q.getEdges(userId)).length, edges)
})

test('an update changes only the fields named, and undo restores the original exactly', async () => {
  const t = await m.q.createNode(userId, 'Task', { name: 'Report', status: 'todo', priority: 'low', notes: 'keep me' })
  const { result } = await m.router.executeBatch(userId, [{ kind: 'updateNode', nodeId: t.id, properties: { priority: 'high' } }])
  const after = (await m.q.getNodeById(userId, t.id))!.properties as Record<string, unknown>
  assert.equal(after.priority, 'high')
  assert.equal(after.notes, 'keep me', 'other fields are kept')
  await m.router.rollbackBatch(userId, result)
  assert.deepEqual((await m.q.getNodeById(userId, t.id))!.properties, { name: 'Report', status: 'todo', priority: 'low', notes: 'keep me' })
})

test('a deleted item comes back with its links', async () => {
  const proj = await m.q.createNode(userId, 'Project', { name: 'Garden', status: 'active' })
  const task = await m.q.createNode(userId, 'Task', { name: 'Dig' })
  await m.q.createEdge(userId, task.id, proj.id, 'part-of')
  const { result } = await m.router.executeBatch(userId, [{ kind: 'deleteNode', nodeId: task.id }])
  assert.equal(await m.q.getNodeById(userId, task.id), undefined)
  await m.router.rollbackBatch(userId, result)
  const back = (await m.q.getNodes(userId, { type: 'Task' })).find((n) => (n.properties as Record<string, unknown>).name === 'Dig')!
  assert.ok(back)
  assert.equal((await m.q.getEdges(userId, { sourceId: back.id, targetId: proj.id, type: 'part-of' })).length, 1)
})

test('moving a to-do leaves it in exactly one list, and undo puts it back', async () => {
  const a = await m.q.createNode(userId, 'Project', { name: 'From', status: 'active' })
  const b = await m.q.createNode(userId, 'Project', { name: 'To', status: 'active' })
  const t = await m.q.createNode(userId, 'Task', { name: 'Mover' })
  await m.q.createEdge(userId, t.id, a.id, 'part-of')
  const { result } = await m.router.executeBatch(userId, [
    { kind: 'deleteEdge', sourceRef: String(t.id), targetRef: String(a.id), type: 'part-of' },
    { kind: 'createEdge', sourceRef: String(t.id), targetRef: String(b.id), type: 'part-of' },
  ])
  const lists = async () => (await m.q.getEdges(userId, { sourceId: t.id, type: 'part-of' })).map((e) => e.targetId)
  assert.deepEqual(await lists(), [b.id])
  await m.router.rollbackBatch(userId, result)
  assert.deepEqual(await lists(), [a.id])
})

test('merging two lists moves everything across and removes the empty one; renaming too; undo brings both back exactly', async () => {
  const area = await m.q.createNode(userId, 'Goal', { name: 'Parent', status: 'active' })
  const a = await m.q.createNode(userId, 'Project', { name: 'Gym', status: 'active' })
  const b = await m.q.createNode(userId, 'Project', { name: 'Fitness', status: 'active' })
  const t1 = await m.q.createNode(userId, 'Task', { name: 'Squats' })
  const t2 = await m.q.createNode(userId, 'Task', { name: 'Stretch' })
  await m.q.createEdge(userId, a.id, area.id, 'part-of')
  await m.q.createEdge(userId, t1.id, a.id, 'part-of')
  await m.q.createEdge(userId, t2.id, a.id, 'part-of')
  const { result } = await m.router.executeBatch(userId, [
    { kind: 'updateNode', nodeId: b.id, properties: { name: 'Training' }, expect: { name: 'Fitness' } },
    { kind: 'deleteEdge', sourceRef: String(t1.id), targetRef: String(a.id), type: 'part-of' },
    { kind: 'createEdge', sourceRef: String(t1.id), targetRef: String(b.id), type: 'part-of' },
    { kind: 'deleteEdge', sourceRef: String(t2.id), targetRef: String(a.id), type: 'part-of' },
    { kind: 'createEdge', sourceRef: String(t2.id), targetRef: String(b.id), type: 'part-of' },
    { kind: 'deleteNode', nodeId: a.id },
  ])
  const inList = async (id: number) => (await m.q.getEdges(userId, { sourceId: id, type: 'part-of' })).map((e) => e.targetId)
  assert.equal(await m.q.getNodeById(userId, a.id), undefined)
  assert.deepEqual([await inList(t1.id), await inList(t2.id)], [[b.id], [b.id]])
  assert.equal(((await m.q.getNodeById(userId, b.id))!.properties as Record<string, unknown>).name, 'Training')
  const back = await m.router.rollbackBatch(userId, result)
  assert.deepEqual(back.errors, [])
  assert.ok(await m.q.getNodeById(userId, a.id), 'the merged-away list is back')
  assert.deepEqual([await inList(t1.id), await inList(t2.id)], [[a.id], [a.id]])
  assert.deepEqual(await inList(a.id), [area.id], 'and it is under its area again')
  assert.equal(((await m.q.getNodeById(userId, b.id))!.properties as Record<string, unknown>).name, 'Fitness')
})

test('a proposal is stale when what it would change was edited since, or is too old', async () => {
  const t = await m.q.createNode(userId, 'Task', { name: 'Edited later' })
  await m.q.updateNode(userId, t.id, { name: 'Edited later', status: 'done' })
  const ops = [{ kind: 'updateNode' as const, nodeId: t.id, properties: { priority: 'high' } }]
  assert.equal((await m.router.staleOperations(userId, ops, '2020-01-01 00:00:00', Date.parse('2020-01-02'))).length, 1)
  assert.equal((await m.router.staleOperations(userId, ops, '2999-01-01 00:00:00', Date.parse('2999-01-02'))).length, 0)
  assert.equal((await m.router.staleOperations(userId, [], '2020-01-01 00:00:00')).length, 1, 'older than 14 days')
  const gone = [{ kind: 'deleteNode' as const, nodeId: 424242 }]
  assert.match((await m.router.staleOperations(userId, gone, '2999-01-01 00:00:00', Date.parse('2999-01-02')))[0], /no longer exists/)
})

test('undo is refused, not silent, when something it made was edited since', async () => {
  const { result } = await m.router.executeBatch(userId, [{ kind: 'createNode', type: 'Task', properties: { name: 'Touched' } }])
  await m.q.updateNode(userId, result.createdNodeIds[0], { name: 'Touched', status: 'done' })
  const changed = await m.router.changedSinceApproval(userId, result, '2020-01-01T00:00:00.000Z')
  assert.deepEqual(changed, ['Touched'])
  assert.deepEqual(await m.router.changedSinceApproval(userId, result, '2999-01-01T00:00:00.000Z'), [])
})

test('a repeat spawned from a to-do the batch made is taken back with it', async () => {
  const { result } = await m.router.executeBatch(userId, [{ kind: 'createNode', type: 'Task', properties: { name: 'Run', recurrence: { frequency: 'daily' } } }])
  const first = result.createdNodeIds[0]
  const spawned = await m.q.createNode(userId, 'Task', { name: 'Run', seriesId: first })
  await m.router.rollbackBatch(userId, result)
  assert.equal(await m.q.getNodeById(userId, first), undefined)
  assert.equal(await m.q.getNodeById(userId, spawned.id), undefined)
})

test('a deleted item comes back under the same id, so what pointed at it still does', async () => {
  const stretch = await m.q.createNode(userId, 'Task', { name: 'Stretch', recurrence: { frequency: 'daily' }, status: 'todo' })
  const next = await m.q.createNode(userId, 'Task', { name: 'Stretch', seriesId: stretch.id, status: 'todo' })
  const { result } = await m.router.executeBatch(userId, [{ kind: 'deleteNode', nodeId: stretch.id }])
  await m.router.rollbackBatch(userId, result)
  const back = await m.q.getNodeById(userId, stretch.id)
  assert.ok(back, 'restored under its own id')
  assert.equal((next.properties as Record<string, unknown>).seriesId, back!.id, 'the next time round still points at it')
})

test('undo keeps an edit made after approval instead of overwriting it', async () => {
  const t = await m.q.createNode(userId, 'Task', { name: 'Chapter', priority: 'low', status: 'todo' })
  const { result } = await m.router.executeBatch(userId, [{ kind: 'updateNode', nodeId: t.id, properties: { priority: 'high' } }])
  // The user then changes the same field and completes it.
  await m.q.updateNode(userId, t.id, { name: 'Chapter', priority: 'medium', status: 'done' })
  const back = await m.router.rollbackBatch(userId, result)
  const now = (await m.q.getNodeById(userId, t.id))!.properties as Record<string, unknown>
  assert.equal(now.priority, 'medium', 'their later edit is kept')
  assert.equal(now.status, 'done', 'a field the batch never touched is untouched')
  assert.equal(back.kept.length, 1)
})

test('undo puts back only the fields the batch wrote, when they are still as written', async () => {
  const t = await m.q.createNode(userId, 'Task', { name: 'Essay', priority: 'low', status: 'todo' })
  const { result } = await m.router.executeBatch(userId, [{ kind: 'updateNode', nodeId: t.id, properties: { priority: 'high' } }])
  await m.q.updateNode(userId, t.id, { name: 'Essay', priority: 'high', status: 'done' })
  await m.router.rollbackBatch(userId, result)
  const now = (await m.q.getNodeById(userId, t.id))!.properties as Record<string, unknown>
  assert.equal(now.priority, 'low')
  assert.equal(now.status, 'done', 'completing it afterwards is not undone')
})

test('a rollback that hits an error carries on and reports it, rather than stopping halfway', async () => {
  const { result } = await m.router.executeBatch(userId, [
    { kind: 'createNode', type: 'Task', properties: { name: 'A1' } },
    { kind: 'createNode', type: 'Task', properties: { name: 'A2' } },
  ])
  // Make the first removal fail by pointing at an edge that does not exist; the nodes must still go.
  result.createdEdgeIds.push(987654321)
  const back = await m.router.rollbackBatch(userId, result)
  assert.equal(await m.q.getNodeById(userId, result.createdNodeIds[0]), undefined)
  assert.equal(await m.q.getNodeById(userId, result.createdNodeIds[1]), undefined)
  assert.ok(back.removed >= 2)
})

test('a proposal whose watched fields are unchanged is not stale just because something else wrote to the node', async () => {
  const t = await m.q.createNode(userId, 'Task', { name: 'Gym', priority: 'low' })
  await m.q.updateNode(userId, t.id, { name: 'Gym', priority: 'low', time: '07:00' }) // a replan touches `time`
  const ops = [{ kind: 'updateNode' as const, nodeId: t.id, properties: { priority: 'high' }, expect: { priority: 'low' } }]
  assert.equal((await m.router.staleOperations(userId, ops, '2020-01-01 00:00:00', Date.parse('2020-01-02'))).length, 0)
  await m.q.updateNode(userId, t.id, { name: 'Gym', priority: 'medium', time: '07:00' })
  assert.equal((await m.router.staleOperations(userId, ops, '2020-01-01 00:00:00', Date.parse('2020-01-02'))).length, 1, 'the field it would change did move')
})

test('a proposal claimed and never finished waits again, because none of its writes happened', async () => {
  const p = await m.props.createProposal(userId, 'stuck', [])
  await m.props.claimProposal(p.id, userId)
  assert.equal(await m.props.sweepInterrupted(userId, Date.now()), 0, 'a claim that is only seconds old is just slow')
  assert.equal(await m.props.sweepInterrupted(userId, Date.now() + 10 * 60_000), 1)
  assert.equal((await m.props.getProposalById(p.id, userId))!.status, 'pending')
  assert.ok(await m.props.claimProposal(p.id, userId), 'and can be approved again')
})

test('inside a transaction, a batch that fails leaves nothing at all: the database undoes it', async () => {
  const { inTransaction } = await import('@/lib/db')
  const nodes = (await m.q.getNodes(userId)).length
  const edges = (await m.q.getEdges(userId)).length
  await assert.rejects(() => inTransaction(async () => {
    await m.router.executeBatch(userId, [
      { kind: 'createNode', type: 'Project', properties: { name: 'Atomic' } },
      { kind: 'createNode', type: 'Task', properties: { name: 'Atomic step' } },
      { kind: 'createEdge', sourceRef: '$1', targetRef: '$0', type: 'part-of' },
      { kind: 'updateNode', nodeId: 999999, properties: { name: 'nope' } },
    ])
  }))
  assert.equal((await m.q.getNodes(userId)).length, nodes)
  assert.equal((await m.q.getEdges(userId)).length, edges)
})

test('a transaction commits everything together, and a failed approval-note undoes the batch with it', async () => {
  const { inTransaction } = await import('@/lib/db')
  const p = await m.props.createProposal(userId, 'tx', [])
  await m.props.claimProposal(p.id, userId)
  const before = (await m.q.getNodes(userId, { type: 'Task' })).length
  // The batch runs, then recording it fails: the batch must not stay.
  await assert.rejects(() => inTransaction(async () => {
    await m.router.executeBatch(userId, [{ kind: 'createNode', type: 'Task', properties: { name: 'Should vanish' } }])
    throw new Error('could not record')
  }))
  assert.equal((await m.q.getNodes(userId, { type: 'Task' })).length, before)
  // And when it all works, both the writes and the approval are there.
  await inTransaction(async () => {
    const run = await m.router.executeBatch(userId, [{ kind: 'createNode', type: 'Task', properties: { name: 'Stays' } }])
    await m.props.finishProposal(p.id, userId, run.result)
  })
  assert.equal((await m.q.getNodes(userId, { type: 'Task' })).length, before + 1)
  assert.equal((await m.props.getProposalById(p.id, userId))!.status, 'approved')
})

test('undo inside a transaction is all or nothing too', async () => {
  const { inTransaction } = await import('@/lib/db')
  const p = await m.props.createProposal(userId, 'u', [])
  await m.props.claimProposal(p.id, userId)
  const run = await m.router.executeBatch(userId, [{ kind: 'createNode', type: 'Task', properties: { name: 'To undo' } }])
  await m.props.finishProposal(p.id, userId, run.result)
  // An undo that fails partway puts everything back as it was, including the proposal's status.
  await assert.rejects(() => inTransaction(async () => {
    await m.props.markUndone(p.id, userId)
    await m.router.rollbackBatch(userId, run.result)
    throw new Error('step failed')
  }))
  assert.equal((await m.props.getProposalById(p.id, userId))!.status, 'approved')
  assert.ok(await m.q.getNodeById(userId, run.result.createdNodeIds[0]), 'nothing was taken back')
  await inTransaction(async () => {
    await m.props.markUndone(p.id, userId)
    await m.router.rollbackBatch(userId, run.result)
  })
  assert.equal((await m.props.getProposalById(p.id, userId))!.status, 'undone')
  assert.equal(await m.q.getNodeById(userId, run.result.createdNodeIds[0]), undefined)
})
test('undo is held back when the user has put their own to-dos into a project the batch made', async () => {
  const { result } = await m.router.executeBatch(userId, [{ kind: 'createNode', type: 'Project', properties: { name: 'Fresh plan' } }])
  const project = result.createdNodeIds[0]
  const mine = await m.q.createNode(userId, 'Task', { name: 'My own' })
  await m.q.createEdge(userId, mine.id, project, 'part-of')
  const changed = await m.router.changedSinceApproval(userId, result, '2999-01-01T00:00:00.000Z')
  assert.equal(changed.length, 1)
  assert.match(changed[0], /Fresh plan/)
})

test('a node type a batch registered is taken back with it, unless something uses it', async () => {
  const { result } = await m.router.executeBatch(userId, [{ kind: 'proposeNodeType', name: 'MoodEntry', typeSchema: {}, examples: [], reason: 'x' }])
  const { nodeTypeExists } = await import('@/lib/db/node-types')
  assert.equal(await nodeTypeExists(userId, 'MoodEntry'), true)
  await m.router.rollbackBatch(userId, result)
  assert.equal(await nodeTypeExists(userId, 'MoodEntry'), false)
})
