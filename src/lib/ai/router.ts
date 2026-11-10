import { createNode, createEdge, restoreNode, updateNode, deleteNode, deleteEdge, getEdges, getNodeById, getNodes, findExistingEdge } from '@/lib/graph/queries'
import type { Node } from '@/lib/db/schema'
import { createNodeType, deleteNodeType, getSchemaVersion, nodeTypeExists } from '@/lib/db/node-types'
import { logger } from '@/lib/log'
import type { BatchOperation } from '@/lib/ai/tools'
import { identityOf, needsIdentity } from '@/lib/graph/naming'

/** An edge as it was, kept so a deletion can be taken back. */
export interface EdgeRecord { sourceId: number; targetId: number; type: string; properties: Record<string, unknown> }

/**
 * What a batch did, kept so it can be taken back exactly.
 *
 * `createdNodeIds` holds only nodes this batch really made. A node it matched
 * to one that was already there is in `reusedNodeIds` instead, and undo never
 * deletes those: they were the user's before the proposal existed.
 * (Rows saved before these two fields were added lack them; read with defaults.)
 */
export interface ExecutionResult {
  createdNodeIds: number[]
  createdEdgeIds: number[]
  reusedNodeIds?: number[]
  updatedNodePreviousProps: Array<{ nodeId: number; previousProps: Record<string, unknown>; /** The fields the batch wrote, so undo puts back only those, and only if they are still as written. */ appliedProps?: Record<string, unknown> }>
  deletedNodes: Array<{ id: number; type: string; properties: Record<string, unknown>; edges?: EdgeRecord[] }>
  deletedEdges?: EdgeRecord[]
  /** Node types this batch registered, taken back too when nothing uses them. */
  createdNodeTypes?: string[]
}

/** A batch that stopped partway: what it had written by then, so it can be rolled back. */
export class BatchExecutionError extends Error {
  constructor(message: string, readonly partial: ExecutionResult) {
    super(message)
  }
}

/**
 * Only these are matched by name to something already there. They are lists
 * and routines the model tends to propose twice in one breath; a Task or an
 * Event is never merged by name — two "Long run" to-dos are two to-dos — and
 * a finished project is never reused for a new one of the same name.
 */
const DEDUP_TYPES = new Set(['Goal', 'Project', 'Course'])
const FINISHED = new Set(['completed', 'done', 'archived', 'cancelled'])

const asMs = (s: string) => Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')

/** Either "the Nth node this batch creates" or "this existing node". */
type Ref = { kind: 'index'; index: number } | { kind: 'id'; id: number }

function parseRef(ref: string): Ref | null {
  const text = ref.trim()
  const batch = /^\$(\d+)$/.exec(text)
  if (batch) return { kind: 'index', index: Number(batch[1]) }
  if (/^\d+$/.test(text)) return { kind: 'id', id: Number(text) }
  return null
}

/**
 * Works out what every edge in a batch points at, before anything is written.
 *
 * Edges used to be resolved as they were executed, which meant a bad reference
 * was only discovered after the batch's nodes had already been created — the
 * user was left with orphaned nodes and no links, and the failure surfaced as
 * a raw foreign-key error naming a node id that never existed.
 *
 * "$0" means the first node this batch creates; "0" means the node whose id is
 * 0. One character apart, and nothing checked which was meant. A model that
 * drops the "$" produced edges pointing at ids 0,1,2… — never real rows, since
 * ids start at 1 and climb. That exact slip is recovered here rather than
 * failed on: it is only ever applied when the id does not exist AND is a valid
 * position in this batch, so a reference to a real node is never overridden.
 */
async function planEdgeRefs(
  userId: number,
  operations: BatchOperation[],
): Promise<Map<BatchOperation, { source: Ref; target: Ref }>> {
  const createNodeCount = operations.filter((o) => o.kind === 'createNode').length
  const plans = new Map<BatchOperation, { source: Ref; target: Ref }>()

  const resolveOne = async (field: string, raw: string): Promise<Ref> => {
    const parsed = parseRef(raw)
    if (!parsed) throw new Error(`${field} "${raw}" is not a node id or a $N batch reference`)

    if (parsed.kind === 'index') {
      if (parsed.index >= createNodeCount) {
        throw new Error(
          `${field} "${raw}" refers to node ${parsed.index} of this batch, but it only creates ${createNodeCount}`,
        )
      }
      return parsed
    }

    if (await getNodeById(userId, parsed.id)) return parsed

    if (parsed.id < createNodeCount) {
      logger.warn('batch_ref_missing_sigil', { field, raw, interpretedAs: `$${parsed.id}` })
      return { kind: 'index', index: parsed.id }
    }

    throw new Error(`${field} "${raw}" is not an existing node (use "$${'N'}" to reference a node this batch creates)`)
  }

  for (const op of operations) {
    if (op.kind !== 'createEdge') continue
    plans.set(op, {
      source: await resolveOne('sourceRef', op.sourceRef),
      target: await resolveOne('targetRef', op.targetRef),
    })
  }

  return plans
}

function resolveRef(ref: Ref, createdNodeIds: number[]): number {
  if (ref.kind === 'id') return ref.id
  const id = createdNodeIds[ref.index]
  if (id === undefined) throw new Error(`Batch ref $${ref.index} was never created`)
  return id
}

export async function executeBatch(
  userId: number,
  operations: BatchOperation[],
  proposalSchemaVersion?: number,
): Promise<{ summary: string[]; schemaEvolved: boolean; result: ExecutionResult }> {
  const currentVersion = await getSchemaVersion(userId)
  const schemaEvolved =
    proposalSchemaVersion !== undefined && proposalSchemaVersion !== currentVersion

  if (schemaEvolved) {
    logger.warn('schema_version_mismatch', { proposalVersion: proposalSchemaVersion, currentVersion })
  }

  // Every edge is checked before the first node is written, so a batch with a
  // bad reference is rejected whole instead of leaving nodes behind with
  // nothing linking them.
  const edgePlans = await planEdgeRefs(userId, operations)

  const result: ExecutionResult = {
    createdNodeIds: [],
    createdEdgeIds: [],
    reusedNodeIds: [],
    updatedNodePreviousProps: [],
    deletedNodes: [],
    deletedEdges: [],
    createdNodeTypes: [],
  }
  /** What "$0", "$1"… mean: the Nth createNode of this batch, whether made new or matched to an old one. */
  const refIds: number[] = []
  const summary: string[] = []
  // One read per type for the whole batch, not one per operation.
  const byType = new Map<string, Node[]>()
  const nodesOfType = async (type: string) => {
    if (!byType.has(type)) byType.set(type, await getNodes(userId, { type }))
    return byType.get(type)!
  }

  try {
    for (const op of operations) {
      switch (op.kind) {
        case 'createNode': {
          // A named thing with no name is junk the user cannot act on: it
          // shows as an id, cannot be searched for, and nobody remembers what
          // it was meant to be. Refused at the point of writing rather than
          // papered over in every view that later has to render it.
          if (needsIdentity(op.type) && !identityOf(op.properties)) {
            throw new Error(`A ${op.type} needs a name — nothing was created.`)
          }
          if (DEDUP_TYPES.has(op.type) && op.properties.name) {
            const existing = (await nodesOfType(op.type)).find((n) => {
              const p = n.properties as Record<string, unknown>
              return p.name === op.properties.name && !FINISHED.has(String(p.status ?? ''))
            })
            if (existing) {
              refIds.push(existing.id)
              result.reusedNodeIds!.push(existing.id)
              summary.push(`Reused existing ${op.type} node #${existing.id} (deduplicated)`)
              break
            }
          }
          const node = await createNode(userId, op.type, op.properties)
          byType.get(op.type)?.push(node)
          refIds.push(node.id)
          result.createdNodeIds.push(node.id)
          summary.push(`Created ${op.type} node #${node.id}`)
          break
        }
        case 'createEdge': {
          const plan = edgePlans.get(op)
          if (!plan) throw new Error('Edge was not planned — this should be unreachable')
          const sourceId = resolveRef(plan.source, refIds)
          const targetId = resolveRef(plan.target, refIds)
          const duplicate = await findExistingEdge(userId, sourceId, targetId, op.type)
          if (duplicate) {
            summary.push(`"${op.type}" edge ${sourceId} → ${targetId} already exists — skipped`)
            break
          }
          const edge = await createEdge(userId, sourceId, targetId, op.type, op.properties ?? {})
          result.createdEdgeIds.push(edge.id)
          summary.push(`Created "${op.type}" edge #${edge.id} (${sourceId} → ${targetId})`)
          break
        }
        case 'updateNode': {
          const existing = await getNodeById(userId, op.nodeId)
          if (!existing) throw new Error(`Node #${op.nodeId} no longer exists — nothing was changed.`)
          const before = existing.properties as Record<string, unknown>
          result.updatedNodePreviousProps.push({ nodeId: op.nodeId, previousProps: before, appliedProps: op.properties })
          // Merged over what is there: the fields named change, every other one stays.
          await updateNode(userId, op.nodeId, { ...before, ...op.properties })
          summary.push(`Updated node #${op.nodeId}`)
          break
        }
        case 'deleteNode': {
          const existing = await getNodeById(userId, op.nodeId)
          if (existing) {
            // Its links go with it; they are kept so undo can put them back.
            const links = [
              ...(await getEdges(userId, { sourceId: op.nodeId })),
              ...(await getEdges(userId, { targetId: op.nodeId })),
            ]
            const unique = [...new Map(links.map((e) => [e.id, e])).values()]
            result.deletedNodes.push({
              id: existing.id,
              type: existing.type,
              properties: existing.properties as Record<string, unknown>,
              edges: unique.map((e) => ({ sourceId: e.sourceId, targetId: e.targetId, type: e.type, properties: (e.properties ?? {}) as Record<string, unknown> })),
            })
          }
          await deleteNode(userId, op.nodeId)
          summary.push(`Deleted node #${op.nodeId}`)
          break
        }
        case 'deleteEdge': {
          const sourceId = Number(op.sourceRef)
          const targetId = Number(op.targetRef)
          const edge = await findExistingEdge(userId, sourceId, targetId, op.type)
          if (!edge) {
            summary.push(`"${op.type}" edge ${sourceId} → ${targetId} was not there — skipped`)
            break
          }
          result.deletedEdges!.push({ sourceId, targetId, type: edge.type, properties: (edge.properties ?? {}) as Record<string, unknown> })
          await deleteEdge(userId, edge.id)
          summary.push(`Removed "${op.type}" edge ${sourceId} → ${targetId}`)
          break
        }
        case 'proposeNodeType': {
          if (await nodeTypeExists(userId, op.name)) {
            summary.push(`Node type "${op.name}" already exists — skipped`)
            break
          }
          await createNodeType(userId, op.name, op.typeSchema)
          result.createdNodeTypes!.push(op.name)
          summary.push(`Registered new node type "${op.name}"`)
          break
        }
      }
    }
  } catch (error) {
    throw new BatchExecutionError(error instanceof Error ? error.message : String(error), result)
  }

  return { summary, schemaEvolved, result }
}

/**
 * Takes a batch back out, exactly: used when one fails partway (so nothing
 * half-written is left behind) and when the user undoes an approved one.
 *
 * Removes what it created, including the repeats that were spawned from the
 * to-dos it made, puts changed properties back as they were, and restores
 * what it deleted together with the links it had. Nodes that were only
 * *reused* are never touched.
 */
export async function rollbackBatch(userId: number, result: ExecutionResult): Promise<{ removed: number; restored: number; kept: string[]; errors: string[] }> {
  let removed = 0
  let restored = 0
  const kept: string[] = []
  const errors: string[] = []
  /** Best effort, step by step: one failure is recorded and the rest still go, so a rollback is never abandoned halfway. */
  const step = async (what: string, fn: () => Promise<void>) => {
    try { await fn() } catch (error) { errors.push(`${what}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const created = new Set(result.createdNodeIds)

  for (const id of result.createdEdgeIds) await step(`edge ${id}`, async () => { await deleteEdge(userId, id); removed++ })

  // A repeating to-do ticked since it was made has spawned its next one, which carries the first's id as its series.
  if (created.size) {
    await step('repeats', async () => {
      for (const t of await getNodes(userId, { type: 'Task' })) {
        const series = (t.properties as Record<string, unknown>).seriesId
        if (typeof series === 'number' && created.has(series) && !created.has(t.id)) created.add(t.id)
      }
    })
  }
  for (const id of created) await step(`node ${id}`, async () => { await deleteNode(userId, id); removed++ })

  // Changed fields go back only if they are still what the batch wrote: a later edit by the user is kept.
  for (const u of [...result.updatedNodePreviousProps].reverse()) {
    await step(`restore ${u.nodeId}`, async () => {
      const node = await getNodeById(userId, u.nodeId)
      if (!node) return
      const now = node.properties as Record<string, unknown>
      if (!u.appliedProps) { await updateNode(userId, u.nodeId, u.previousProps); restored++; return }
      const next = { ...now }
      for (const key of Object.keys(u.appliedProps)) {
        if (JSON.stringify(now[key]) !== JSON.stringify(u.appliedProps[key])) { kept.push(`“${String(now.name ?? now.title ?? `#${u.nodeId}`)}” (${key})`); continue }
        if (key in u.previousProps) next[key] = u.previousProps[key]
        else delete next[key]
      }
      await updateNode(userId, u.nodeId, next)
      restored++
    })
  }

  // Deleted nodes come back under the id they had when it is free, so what pointed at them by id points at them again.
  const idMap = new Map<number, number>()
  for (const d of result.deletedNodes) {
    await step(`bring back ${d.id}`, async () => {
      const node = await restoreNode(userId, d.id, d.type, d.properties)
      idMap.set(d.id, node.id)
      restored++
    })
  }
  for (const d of result.deletedNodes) {
    for (const e of d.edges ?? []) {
      await step('link', async () => {
        const sourceId = idMap.get(e.sourceId) ?? e.sourceId
        const targetId = idMap.get(e.targetId) ?? e.targetId
        if (!(await getNodeById(userId, sourceId)) || !(await getNodeById(userId, targetId))) return
        if (!(await findExistingEdge(userId, sourceId, targetId, e.type))) await createEdge(userId, sourceId, targetId, e.type, e.properties)
      })
    }
  }
  for (const e of result.deletedEdges ?? []) {
    await step('link', async () => {
      if (!(await getNodeById(userId, e.sourceId)) || !(await getNodeById(userId, e.targetId))) return
      if (!(await findExistingEdge(userId, e.sourceId, e.targetId, e.type))) { await createEdge(userId, e.sourceId, e.targetId, e.type, e.properties); restored++ }
    })
  }
  for (const type of result.createdNodeTypes ?? []) {
    await step(`type ${type}`, async () => {
      if ((await getNodes(userId, { type })).length === 0) await deleteNodeType(userId, type)
    })
  }
  return { removed, restored, kept, errors }
}

/** A proposal this old is no longer a fair picture of the user's data. */
const PROPOSAL_MAX_AGE_DAYS = 14

/**
 * Whether what a proposal points at has moved on since it was made: an item
 * it would change, delete or link is gone, or was edited after the proposal
 * was written. Approving it then would apply a picture that is out of date.
 */
export async function staleOperations(userId: number, operations: BatchOperation[], madeAt: string, now = Date.now()): Promise<string[]> {
  const problems: string[] = []
  const made = asMs(madeAt)
  if (now - made > PROPOSAL_MAX_AGE_DAYS * 86_400_000) problems.push(`it was made more than ${PROPOSAL_MAX_AGE_DAYS} days ago`)

  // What would be changed, deleted or unlinked must be as it was; what is only linked to merely has to exist.
  const unchanged = new Set<number>()
  const exists = new Set<number>()
  for (const op of operations) {
    if (op.kind === 'updateNode' || op.kind === 'deleteNode') unchanged.add(op.nodeId)
    // A move only needs both ends to still exist: the link itself is checked when it is taken away, and a replan touching a to-do is not a reason to refuse.
    if (op.kind === 'deleteEdge') { exists.add(Number(op.sourceRef)); exists.add(Number(op.targetRef)) }
    if (op.kind === 'createEdge') {
      for (const ref of [op.sourceRef, op.targetRef]) if (/^\d+$/.test(ref)) exists.add(Number(ref))
    }
  }
  // When the proposal recorded what the fields it would change were at the time, compare those
  // fields: an unrelated write (a replan, a tick on another field) is not a reason to refuse it.
  const expected = new Map<number, Record<string, unknown>>()
  for (const op of operations) if (op.kind === 'updateNode' && op.expect) expected.set(op.nodeId, op.expect)
  for (const id of new Set([...unchanged, ...exists])) {
    const node = await getNodeById(userId, id)
    if (!node) { problems.push(`#${id} no longer exists`); continue }
    const snapshot = expected.get(id)
    if (snapshot) {
      const now = node.properties as Record<string, unknown>
      const moved = Object.keys(snapshot).filter((k) => JSON.stringify(now[k] ?? null) !== JSON.stringify(snapshot[k] ?? null))
      if (moved.length) problems.push(`“${String(now.name ?? now.title ?? `#${id}`)}” changed after this was suggested (${moved.join(', ')})`)
      continue
    }
    // A two-second margin: the proposal's own time is second-precise, so the same chat turn is not "after" it.
    if (unchanged.has(id) && asMs(node.updatedAt) > made + 2000) {
      const p = node.properties as Record<string, unknown>
      problems.push(`“${String(p.name ?? p.title ?? `#${id}`)}” changed after this was suggested`)
    }
  }
  return problems
}

/** Items this batch made that have been edited since it was approved: undoing would lose those edits. */
export async function changedSinceApproval(userId: number, result: ExecutionResult, approvedAt: string): Promise<string[]> {
  const at = asMs(approvedAt)
  const out: string[] = []
  const madeEdges = new Set(result.createdEdgeIds)
  for (const id of result.createdNodeIds) {
    // Something the user put into a project or area this batch made is theirs: deleting the project would orphan it.
    const children = (await getEdges(userId, { targetId: id })).filter((e) => e.type === 'part-of' && !madeEdges.has(e.id) && !result.createdNodeIds.includes(e.sourceId))
    if (children.length) {
      const owner = await getNodeById(userId, id)
      const op = (owner?.properties ?? {}) as Record<string, unknown>
      out.push(`${String(op.name ?? op.title ?? `#${id}`)} (now holds ${children.length} you added)`)
      continue
    }
    const node = await getNodeById(userId, id)
    if (node && asMs(node.updatedAt) > at) {
      const p = node.properties as Record<string, unknown>
      out.push(String(p.name ?? p.title ?? `#${id}`))
    }
  }
  return out
}
