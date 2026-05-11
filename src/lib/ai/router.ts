import { createNode, createEdge, updateNode, deleteNode, getNodeById, getNodes } from '@/lib/graph/queries'
import { createNodeType, getSchemaVersion, nodeTypeExists } from '@/lib/db/node-types'
import { logger } from '@/lib/log'
import type { BatchOperation } from '@/lib/ai/tools'

export interface ExecutionResult {
  createdNodeIds: number[]
  createdEdgeIds: number[]
  updatedNodePreviousProps: Array<{ nodeId: number; previousProps: Record<string, unknown> }>
  deletedNodes: Array<{ id: number; type: string; properties: Record<string, unknown> }>
}

function resolveRef(ref: string, createdNodeIds: number[]): number {
  if (ref.startsWith('$')) {
    const idx = parseInt(ref.slice(1), 10)
    if (idx >= createdNodeIds.length) throw new Error(`Batch ref $${idx} out of range`)
    return createdNodeIds[idx]
  }
  const id = parseInt(ref, 10)
  if (isNaN(id)) throw new Error(`Invalid node ref: ${ref}`)
  return id
}

export function executeBatch(
  userId: number,
  operations: BatchOperation[],
  proposalSchemaVersion?: number,
): { summary: string[]; schemaEvolved: boolean; result: ExecutionResult } {
  const currentVersion = getSchemaVersion(userId)
  const schemaEvolved =
    proposalSchemaVersion !== undefined && proposalSchemaVersion !== currentVersion

  if (schemaEvolved) {
    logger.warn('schema_version_mismatch', { proposalVersion: proposalSchemaVersion, currentVersion })
  }

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
          const existing = getNodes(userId, { type: op.type }).find(
            (n) => (n.properties as Record<string, unknown>).name === op.properties.name,
          )
          if (existing) {
            result.createdNodeIds.push(existing.id)
            summary.push(`Reused existing ${op.type} node #${existing.id} (deduplicated)`)
            break
          }
        }
        const node = createNode(userId, op.type, op.properties)
        result.createdNodeIds.push(node.id)
        summary.push(`Created ${op.type} node #${node.id}`)
        break
      }
      case 'createEdge': {
        const sourceId = resolveRef(op.sourceRef, result.createdNodeIds)
        const targetId = resolveRef(op.targetRef, result.createdNodeIds)
        const edge = createEdge(userId, sourceId, targetId, op.type, op.properties ?? {})
        result.createdEdgeIds.push(edge.id)
        summary.push(`Created "${op.type}" edge #${edge.id} (${sourceId} → ${targetId})`)
        break
      }
      case 'updateNode': {
        const existing = getNodeById(userId, op.nodeId)
        if (existing) {
          result.updatedNodePreviousProps.push({
            nodeId: op.nodeId,
            previousProps: existing.properties as Record<string, unknown>,
          })
        }
        updateNode(userId, op.nodeId, op.properties)
        summary.push(`Updated node #${op.nodeId}`)
        break
      }
      case 'deleteNode': {
        const existing = getNodeById(userId, op.nodeId)
        if (existing) {
          result.deletedNodes.push({
            id: existing.id,
            type: existing.type,
            properties: existing.properties as Record<string, unknown>,
          })
        }
        deleteNode(userId, op.nodeId)
        summary.push(`Deleted node #${op.nodeId}`)
        break
      }
      case 'proposeNodeType': {
        if (nodeTypeExists(userId, op.name)) {
          summary.push(`Node type "${op.name}" already exists — skipped`)
          break
        }
        createNodeType(userId, op.name, op.typeSchema)
        summary.push(`Registered new node type "${op.name}"`)
        break
      }
    }
  }

  return { summary, schemaEvolved, result }
}
