import { createNode, createEdge, updateNode, deleteNode, getNodeById, getNodes, findExistingEdge } from '@/lib/graph/queries'
import { createNodeType, getSchemaVersion, nodeTypeExists } from '@/lib/db/node-types'
import { logger } from '@/lib/log'
import type { BatchOperation } from '@/lib/ai/tools'

export interface ExecutionResult {
  createdNodeIds: number[]
  createdEdgeIds: number[]
  updatedNodePreviousProps: Array<{ nodeId: number; previousProps: Record<string, unknown> }>
  deletedNodes: Array<{ id: number; type: string; properties: Record<string, unknown> }>
}

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
    updatedNodePreviousProps: [],
    deletedNodes: [],
  }
  const summary: string[] = []

  for (const op of operations) {
    switch (op.kind) {
      case 'createNode': {
        if (op.properties.name) {
          const existing = (await getNodes(userId, { type: op.type })).find(
            (n) => (n.properties as Record<string, unknown>).name === op.properties.name,
          )
          if (existing) {
            result.createdNodeIds.push(existing.id)
            summary.push(`Reused existing ${op.type} node #${existing.id} (deduplicated)`)
            break
          }
        }
        const node = await createNode(userId, op.type, op.properties)
        result.createdNodeIds.push(node.id)
        summary.push(`Created ${op.type} node #${node.id}`)
        break
      }
      case 'createEdge': {
        const plan = edgePlans.get(op)
        if (!plan) throw new Error('Edge was not planned — this should be unreachable')
        const sourceId = resolveRef(plan.source, result.createdNodeIds)
        const targetId = resolveRef(plan.target, result.createdNodeIds)
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
        if (existing) {
          result.updatedNodePreviousProps.push({
            nodeId: op.nodeId,
            previousProps: existing.properties as Record<string, unknown>,
          })
        }
        await updateNode(userId, op.nodeId, op.properties)
        summary.push(`Updated node #${op.nodeId}`)
        break
      }
      case 'deleteNode': {
        const existing = await getNodeById(userId, op.nodeId)
        if (existing) {
          result.deletedNodes.push({
            id: existing.id,
            type: existing.type,
            properties: existing.properties as Record<string, unknown>,
          })
        }
        await deleteNode(userId, op.nodeId)
        summary.push(`Deleted node #${op.nodeId}`)
        break
      }
      case 'proposeNodeType': {
        if (await nodeTypeExists(userId, op.name)) {
          summary.push(`Node type "${op.name}" already exists — skipped`)
          break
        }
        await createNodeType(userId, op.name, op.typeSchema)
        summary.push(`Registered new node type "${op.name}"`)
        break
      }
    }
  }

  return { summary, schemaEvolved, result }
}
