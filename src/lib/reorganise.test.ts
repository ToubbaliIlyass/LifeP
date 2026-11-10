import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileReorganise, type OrgSnapshot } from './reorganise'
import { withoutMoves } from './plan-compile'

const snap: OrgSnapshot = {
  todos: [
    { id: 1, title: 'Buy shoes', type: 'Task', done: false, listId: null },
    { id: 2, title: 'Long run', type: 'Task', done: false, listId: 10 },
    { id: 3, title: 'Old thing', type: 'Task', done: true, listId: null },
    { id: 4, title: 'Stretch', type: 'Event', done: false, listId: null },
  ],
  lists: [{ id: 10, title: 'Misc', kind: 'project', areaId: null }, { id: 11, title: 'Marathon', kind: 'project', areaId: null }, { id: 12, title: 'Health', kind: 'area', areaId: null }],
  listEdges: [{ sourceId: 2, targetId: 10, type: 'part-of', todoId: 2, listId: 10 }],
}
const input = (moves: { todoId: number; toListId?: number; toNewListKey?: string }[], newLists: never[] = []) => ({ reason: 'Group the running things', moves, newLists })

test('a move takes the old link away and adds the new one, both tagged so they can be shown and unticked', () => {
  const r = compileReorganise(input([{ todoId: 2, toListId: 11 }]), snap)
  assert.deepEqual(r.operations.map((o) => o.kind), ['deleteEdge', 'createEdge'])
  const [del, add] = r.operations as never as { sourceRef: string; targetRef: string; move: { from: string; to: string } }[]
  assert.deepEqual([del.sourceRef, del.targetRef], ['2', '10'])
  assert.deepEqual([add.sourceRef, add.targetRef], ['2', '11'])
  assert.equal(add.move.from, 'Misc')
  assert.equal(add.move.to, 'Marathon')
})

test('a loose to-do has nothing to unlink, just a link to add', () => {
  const r = compileReorganise(input([{ todoId: 1, toListId: 11 }]), snap)
  assert.deepEqual(r.operations.map((o) => o.kind), ['createEdge'])
})

test('only open, plain to-dos move; done ones, other kinds, strangers and missing lists are left alone and said so', () => {
  const r = compileReorganise(input([{ todoId: 3, toListId: 11 }, { todoId: 4, toListId: 11 }, { todoId: 999, toListId: 11 }, { todoId: 1, toListId: 777 }, { todoId: 1, toListId: 11 }]), snap)
  assert.equal(r.moved, 1)
  assert.equal(r.skipped.length, 4)
  assert.match(r.skipped.join(' '), /already done/)
  assert.match(r.skipped.join(' '), /not a plain to-do/)
})

test('new lists are made first and moves point at them; an existing list of that name is reused, not duplicated', () => {
  const r = compileReorganise({
    reason: 'x',
    newLists: [{ key: 'a', kind: 'project', name: 'Race prep', areaId: 12 }, { key: 'b', kind: 'project', name: 'marathon' }],
    moves: [{ todoId: 1, toNewListKey: 'a' }, { todoId: 2, toNewListKey: 'b' }],
  }, snap)
  assert.deepEqual(r.operations.filter((o) => o.kind === 'createNode').map((o) => (o.kind === 'createNode' ? o.properties.name : '')), ['Race prep'])
  const edges = r.operations.filter((o) => o.kind === 'createEdge') as unknown as { sourceRef: string; targetRef: string }[]
  assert.deepEqual(edges.map((e) => [e.sourceRef, e.targetRef]), [['$0', '12'], ['1', '$0'], ['2', '11']], 'the new project sits under Health, to-do 1 goes into it, to-do 2 into the existing Marathon')
})

test('a to-do already in that list is not moved, and with nothing to move it says so', () => {
  assert.throws(() => compileReorganise(input([{ todoId: 2, toListId: 10 }]), snap), /Nothing needed to change/)
})

test('unticking a move leaves the rest', () => {
  const r = compileReorganise(input([{ todoId: 1, toListId: 11 }, { todoId: 2, toListId: 11 }]), snap)
  const kept = withoutMoves(r.operations, [0])
  assert.equal(kept.length, 2, 'to-do 2 keeps both halves of its move')
  assert.ok(kept.every((o) => (o as unknown as { move: { todoId: number } }).move.todoId === 2))
})


const withKids: OrgSnapshot = {
  ...snap,
  lists: [...snap.lists, { id: 13, title: 'Job', kind: 'area', areaId: null }, { id: 14, title: 'Work', kind: 'area', areaId: null }],
  children: [{ childId: 20, listId: 13, type: 'part-of' }, { childId: 21, listId: 13, type: 'part-of' }, { childId: 2, listId: 10, type: 'part-of' }],
}

test('renaming a list is one tagged update that remembers the old name; a clash or no change is skipped', () => {
  const r = compileReorganise({ reason: 'x', renames: [{ listId: 10, name: 'Errands' }, { listId: 11, name: 'Fine' }, { listId: 12, name: 'health' }, { listId: 10, name: 'Again' }] }, withKids)
  const ups = r.operations.filter((o) => o.kind === 'updateNode') as unknown as { nodeId: number; properties: { name: string }; expect: { name: string }; move: { kind: string } }[]
  assert.equal(r.renamed, 2, 'Errands and Fine; health is the same name, and a second rename of Misc is ignored')
  assert.deepEqual(ups.map((u) => [u.nodeId, u.properties.name, u.expect.name]), [[10, 'Errands', 'Misc'], [11, 'Fine', 'Marathon']])
  assert.equal(ups[0].move.kind, 'rename')
})

test('a rename that would collide with another list of the same kind is left out and said', () => {
  const r = compileReorganise({ reason: 'x', renames: [{ listId: 10, name: 'Marathon' }, { listId: 11, name: 'Fine' }] }, withKids)
  assert.equal(r.renamed, 1)
  assert.match(r.skipped.join(' '), /already the name/)
})

test('a merge carries every child across, then removes the emptied list, all under one tag', () => {
  const r = compileReorganise({ reason: 'same thing', merges: [{ fromListId: 13, intoListId: 14 }] }, withKids)
  assert.equal(r.merged, 1)
  assert.deepEqual(r.operations.map((o) => o.kind), ['deleteEdge', 'createEdge', 'deleteEdge', 'createEdge', 'deleteNode'])
  const tags = new Set(r.operations.map((o) => (o as unknown as { move: { id: number } }).move.id))
  assert.equal(tags.size, 1)
  assert.equal((r.operations[4] as unknown as { nodeId: number }).nodeId, 13)
  assert.equal(withoutMoves(r.operations, [0]).length, 0, 'unticking the merge drops all of it')
})

test('different kinds never merge; a list that goes away takes no rename, and nothing moves into it or out of it', () => {
  const r = compileReorganise({
    reason: 'x',
    merges: [{ fromListId: 13, intoListId: 14 }, { fromListId: 10, intoListId: 12 }],
    renames: [{ listId: 13, name: 'Careers' }],
    moves: [{ todoId: 1, toListId: 13 }, { todoId: 1, toListId: 11 }],
  }, withKids)
  assert.equal(r.merged, 1)
  assert.equal(r.renamed, 0)
  assert.equal(r.moved, 1, 'only the move to Marathon; the one into the merged-away area is refused')
})
