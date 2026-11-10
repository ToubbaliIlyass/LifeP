import { z } from 'zod'
import type { BatchOperation } from '@/lib/ai/tools'
import type { MoveTag } from '@/lib/plan-compile'

/**
 * Rearranging what the user has, as a proposal they can see and trim.
 *
 * The model says only WHICH to-do goes WHERE (and which new lists to make for
 * them). This turns that into operations in plain code, after checking every
 * id against what really exists: it cannot move something that is not an
 * open to-do of theirs and cannot name a list that is not there. It can
 * rename a list and merge two lists of the same kind (everything in one goes
 * into the other, then the empty one is removed); nothing else is ever
 * deleted. A move is two operations, taking the old link away and adding the
 * new one, so a to-do is in exactly one list afterwards. Every change carries
 * a tag so the screen can show it and the user can leave it out, and undo
 * puts all of it back.
 */

export const MAX_MOVES = 25
const MAX_NEW_LISTS = 6
const MAX_RENAMES = 8
const MAX_MERGES = 4

export const ReorganiseInputSchema = z.object({
  reason: z.string().describe('One plain sentence: what is better afterwards'),
  newLists: z.array(z.object({
    key: z.string().describe('A short id you choose, used by moves as toNewListKey'),
    kind: z.enum(['area', 'project']),
    name: z.string(),
    areaId: z.number().optional().describe('For a project: the id of an existing area it sits under'),
    areaKey: z.string().optional().describe('For a project: the key of a new area from this same list'),
  })).max(MAX_NEW_LISTS).optional(),
  moves: z.array(z.object({
    todoId: z.number(),
    toListId: z.number().optional().describe('An existing area or project'),
    toNewListKey: z.string().optional().describe('A list from newLists'),
  })).max(MAX_MOVES).optional(),
  renames: z.array(z.object({
    listId: z.number().describe('An existing area or project'),
    name: z.string().describe('The clearer name: short, plain, same meaning'),
  })).max(MAX_RENAMES).optional(),
  merges: z.array(z.object({
    fromListId: z.number().describe('The list that goes away: its contents move into intoListId'),
    intoListId: z.number().describe('The list that stays. Same kind as the other (area into area, project into project)'),
  })).max(MAX_MERGES).optional(),
})
export type ReorganiseInput = z.infer<typeof ReorganiseInputSchema>

export interface OrgSnapshot {
  todos: { id: number; title: string; type: string; done: boolean; listId: number | null }[]
  lists: { id: number; title: string; kind: 'area' | 'project'; areaId: number | null }[]
  /** Every link between a to-do and a list, either direction, as stored. */
  listEdges: { sourceId: number; targetId: number; type: string; todoId: number; listId: number }[]
  /** Everything that is part of a list (a to-do, a project in an area), for merging. */
  children?: { childId: number; listId: number; type: string }[]
}

const clean = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, n) : '')

export interface CompiledMoves {
  operations: BatchOperation[]
  summary: string
  moved: number
  renamed: number
  merged: number
  /** Said to the user: what was left out and why. */
  skipped: string[]
}

export function compileReorganise(input: ReorganiseInput, snap: OrgSnapshot): CompiledMoves {
  const operations: BatchOperation[] = []
  const skipped: string[] = []
  const todo = new Map(snap.todos.map((t) => [t.id, t]))
  const list = new Map(snap.lists.map((l) => [l.id, l]))

  // New lists first, so moves can point at them by "$N".
  const newRef = new Map<string, { ref: string; name: string }>()
  const seen = new Set<string>()
  for (const nl of (input.newLists ?? []).slice(0, MAX_NEW_LISTS)) {
    const name = clean(nl.name, 80)
    if (!name || seen.has(nl.key)) continue
    seen.add(nl.key)
    // Something the user already has by that name is used, never made twice.
    const same = snap.lists.find((l) => l.kind === nl.kind && l.title.trim().toLowerCase() === name.toLowerCase())
    if (same) { newRef.set(nl.key, { ref: String(same.id), name: same.title }); skipped.push(`“${same.title}” already exists, so it was used.`); continue }
    const index = operations.filter((o) => o.kind === 'createNode').length
    operations.push({ kind: 'createNode', type: nl.kind === 'area' ? 'Goal' : 'Project', properties: { name, status: 'active' } })
    newRef.set(nl.key, { ref: `$${index}`, name })
    if (nl.kind === 'project') {
      const parent = nl.areaId !== undefined && list.get(nl.areaId)?.kind === 'area' ? String(nl.areaId) : nl.areaKey ? newRef.get(nl.areaKey)?.ref : undefined
      if (parent) operations.push({ kind: 'createEdge', sourceRef: `$${index}`, targetRef: parent, type: 'part-of' })
    }
  }

  let moveId = 0
  const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ')

  // Merges: decided first, because a list that is going away takes part in nothing else.
  const gone = new Set<number>()
  const into = new Set<number>()
  const mergeOps: BatchOperation[] = []
  let merged = 0
  for (const mg of (input.merges ?? []).slice(0, MAX_MERGES)) {
    const a = list.get(mg.fromListId)
    const b = list.get(mg.intoListId)
    if (!a || !b) { skipped.push('A list to merge was not found.'); continue }
    if (a.id === b.id || a.kind !== b.kind) { skipped.push(`“${a.title}” and “${b.title}” are not the same kind of list, so they stay apart.`); continue }
    if (gone.has(a.id) || gone.has(b.id) || into.has(a.id)) { skipped.push(`“${a.title}” is already part of another change.`); continue }
    const tag: MoveTag = { id: moveId++, kind: 'merge', todoId: a.id, todo: a.title || 'a list', from: null, to: b.title || 'a list', count: 0 }
    const kids = (snap.children ?? []).filter((c) => c.listId === a.id && c.childId !== b.id)
    tag.count = kids.length
    for (const c of kids) {
      mergeOps.push({ kind: 'deleteEdge', sourceRef: String(c.childId), targetRef: String(a.id), type: c.type, move: tag } as BatchOperation)
      mergeOps.push({ kind: 'createEdge', sourceRef: String(c.childId), targetRef: String(b.id), type: c.type, move: tag } as BatchOperation)
    }
    mergeOps.push({ kind: 'deleteNode', nodeId: a.id, move: tag } as BatchOperation)
    gone.add(a.id)
    into.add(b.id)
    merged++
  }

  // Renames: a clearer name for a list that is staying, never one that collides with another.
  let renamed = 0
  const renamedIds = new Set<number>()
  for (const r of (input.renames ?? []).slice(0, MAX_RENAMES)) {
    const l = list.get(r.listId)
    const name = clean(r.name, 80)
    if (!l) { skipped.push('A list to rename was not found.'); continue }
    if (!name || norm(name) === norm(l.title) || renamedIds.has(l.id)) continue
    if (gone.has(l.id)) { skipped.push(`“${l.title}” is being merged, so it is not renamed.`); continue }
    if (snap.lists.some((o) => o.id !== l.id && o.kind === l.kind && !gone.has(o.id) && norm(o.title) === norm(name))) { skipped.push(`“${name}” is already the name of another list, so “${l.title}” keeps its name.`); continue }
    const tag: MoveTag = { id: moveId++, kind: 'rename', todoId: l.id, todo: l.title, from: l.title, to: name }
    operations.push({ kind: 'updateNode', nodeId: l.id, properties: { name }, expect: { name: l.title }, move: tag } as BatchOperation)
    renamedIds.add(l.id)
    renamed++
  }

  const moved = new Set<number>()
  for (const m of input.moves ?? []) {
    const t = todo.get(m.todoId)
    if (!t) { skipped.push(`A to-do (#${m.todoId}) was not found.`); continue }
    const title = clean(t.title, 80) || 'A to-do'
    if (t.done) { skipped.push(`“${title}” is already done, so it stays.`); continue }
    if (t.type !== 'Task') { skipped.push(`“${title}” is not a plain to-do, so it stays.`); continue }
    if (moved.has(t.id)) continue
    if (t.listId !== null && gone.has(t.listId)) { skipped.push(`“${title}” goes along with the merge.`); continue }
    let toRef: string | undefined
    let toName = ''
    if (m.toListId !== undefined) {
      const dest = list.get(m.toListId)
      if (!dest) { skipped.push(`“${title}”: that list was not found.`); continue }
      if (gone.has(dest.id)) { skipped.push(`“${title}”: that list is being merged away.`); continue }
      if (t.listId === dest.id) continue
      toRef = String(dest.id)
      toName = dest.title || (dest.kind === 'area' ? 'an area' : 'a project')
    } else if (m.toNewListKey && newRef.has(m.toNewListKey)) {
      const n = newRef.get(m.toNewListKey)!
      toRef = n.ref
      toName = n.name
    }
    if (!toRef) { skipped.push(`“${title}” had nowhere to go, so it stays.`); continue }

    const fromName = t.listId !== null ? (list.get(t.listId)?.title || null) : null
    const tag: MoveTag = { id: moveId++, todoId: t.id, todo: title, from: fromName, to: toName }
    // Away from every list it is linked to, then into the one: it is in exactly one list afterwards.
    for (const e of snap.listEdges.filter((x) => x.todoId === t.id)) {
      operations.push({ kind: 'deleteEdge', sourceRef: String(e.sourceId), targetRef: String(e.targetId), type: e.type, move: tag } as BatchOperation)
    }
    operations.push({ kind: 'createEdge', sourceRef: String(t.id), targetRef: toRef, type: 'part-of', move: tag } as BatchOperation)
    moved.add(t.id)
  }
  operations.push(...mergeOps)
  if (moved.size === 0 && renamed === 0 && merged === 0) throw new Error('Nothing needed to change.')

  const reason = clean(input.reason, 200)
  const parts = [
    moved.size ? `${moved.size} to-do${moved.size === 1 ? '' : 's'} to move` : '',
    renamed ? `${renamed} list${renamed === 1 ? '' : 's'} to rename` : '',
    merged ? `${merged} merge${merged === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(', ')
  const summary = `Tidy up your lists\n\n${reason ? `${reason.replace(/[.]+$/, '')}. ` : ''}${parts}${skipped.length ? `. ${skipped.slice(0, 3).join(' ')}` : '.'}`
  return { operations, summary, moved: moved.size, renamed, merged, skipped }
}
