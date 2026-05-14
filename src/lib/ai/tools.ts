import { tool } from 'ai'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges, createNode, createEdge, updateNode } from '@/lib/graph/queries'
import { createProposal } from '@/lib/db/proposals'
import { getSchemaVersion } from '@/lib/db/node-types'

export const BatchOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('createNode'),
    type: z.string().describe('Node type e.g. Goal, Habit, Task, Event, Concept'),
    properties: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal('createEdge'),
    // "$N" = Nth createNode result in this batch (0-indexed). Plain number string = existing node ID.
    sourceRef: z.string().describe('Source node ID ("42") or batch index reference ("$0")'),
    targetRef: z.string().describe('Target node ID ("42") or batch index reference ("$0")'),
    type: z.string().describe('Edge type e.g. supports, blocks, part-of'),
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('updateNode'),
    nodeId: z.number(),
    properties: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal('deleteNode'),
    nodeId: z.number(),
  }),
  z.object({
    kind: z.literal('proposeNodeType'),
    name: z.string().describe('PascalCase type name e.g. EnergyLog, MoodEntry'),
    typeSchema: z.record(z.string(), z.unknown()).describe('Expected properties and their types'),
    examples: z.array(z.number()).describe('IDs of existing Concept nodes that exemplify this type'),
    reason: z.string().describe('Why this pattern deserves its own type'),
  }),
])

export type BatchOperation = z.infer<typeof BatchOperationSchema>

// Structural types must go through batchPropose — createNode rejects these directly
const ALWAYS_PROPOSE_TYPES = new Set(['Goal', 'Habit', 'Task', 'Project', 'Event', 'Course', 'Exam', 'Assignment'])

export function buildTools() {
  const user = getCurrentUser()

  return {
    readGraph: tool({
      description: 'Read the knowledge graph. Returns all nodes and edges for the current user, optionally filtered by type.',
      inputSchema: z.object({
        filter: z.string().optional().describe('e.g. "type:Goal" to get only goal nodes'),
      }),
      execute: async ({ filter }) => {
        let typeFilter: string | undefined
        if (filter?.startsWith('type:')) typeFilter = filter.slice(5)
        const nodes = getNodes(user.id, typeFilter ? { type: typeFilter } : undefined)
        const edges = getEdges(user.id)
        return { nodes, edges }
      },
    }),

    searchNodes: tool({
      description: 'Search nodes by keyword in their properties.',
      inputSchema: z.object({
        query: z.string().describe('Text to search for in node properties'),
      }),
      execute: async ({ query }) => {
        const allNodes = getNodes(user.id)
        const q = query.toLowerCase()
        const matches = allNodes.filter((n) =>
          JSON.stringify(n.properties).toLowerCase().includes(q),
        )
        return { nodes: matches, count: matches.length }
      },
    }),

    createNode: tool({
      description:
        'Create a single node immediately (intent="auto" only). For structural entities (Goal, Habit, Task, Project, Event, Course, Exam, Assignment) you MUST use batchPropose instead — calling this tool for those types will be rejected.',
      inputSchema: z.object({
        type: z.string(),
        properties: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ type, properties }) => {
        if (ALWAYS_PROPOSE_TYPES.has(type)) {
          return { error: `Cannot create ${type} directly. Use batchPropose with a createNode operation instead.` }
        }
        if (properties.name) {
          const existing = getNodes(user.id, { type }).find(
            (n) => (n.properties as Record<string, unknown>).name === properties.name,
          )
          if (existing) return { created: false, node: existing, deduplicated: true }
        }
        const node = createNode(user.id, type, properties)
        return { created: true, node }
      },
    }),

    createEdge: tool({
      description:
        'Create an edge between two existing nodes immediately. Only use this for linking already-existing nodes (intent="auto"). If the edge is part of a structural proposal, include it inside batchPropose instead.',
      inputSchema: z.object({
        sourceId: z.number().describe('Source node ID'),
        targetId: z.number().describe('Target node ID'),
        type: z.string().describe('Relationship type e.g. supports, blocks, part-of'),
        properties: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async ({ sourceId, targetId, type, properties }) => {
        const edge = createEdge(user.id, sourceId, targetId, type, properties ?? {})
        return { created: true, edge }
      },
    }),

    updateNodeProperties: tool({
      description:
        'Update properties on an existing node immediately. Use for status changes, habit completions, grade updates, and lightweight field edits. For renames or core structural changes to important nodes, use batchPropose with an updateNode operation instead.',
      inputSchema: z.object({
        nodeId: z.number(),
        properties: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ nodeId, properties }) => {
        const existing = getNodes(user.id).find((n) => n.id === nodeId)
        if (!existing) return { updated: false, error: 'Node not found' }
        const merged = { ...(existing.properties as Record<string, unknown>), ...properties }
        const node = updateNode(user.id, nodeId, merged)
        return node ? { updated: true, node } : { updated: false, error: 'Node not found' }
      },
    }),

    deleteNode: tool({
      description: 'Propose deletion of a node and its edges. Always queued for user approval — use batchPropose with a deleteNode operation.',
      inputSchema: z.object({
        nodeId: z.number(),
        reason: z.string().describe('Why this node should be deleted'),
      }),
      execute: async ({ nodeId, reason }) => {
        const proposal = createProposal(
          user.id,
          `Delete node ${nodeId}: ${reason}`,
          [{ kind: 'deleteNode', nodeId }],
        )
        return { proposed: true, proposalId: proposal.id, summary: proposal.summary }
      },
    }),

    batchPropose: tool({
      description:
        'Propose a set of related graph changes as a single atomic proposal the user can approve or reject together. Use this when creating structural nodes (Goal, Habit, Task, Project, Event, Course, Exam, Assignment) and their edges. createEdge entries can reference createNode results by "$0", "$1", etc. (0-indexed, counting only createNode operations in order). Requires a reasoning field explaining each edge.',
      inputSchema: z.object({
        summary: z.string().describe('One-sentence summary of what this batch does'),
        reasoning: z.string().describe('For each edge in this batch, one sentence explaining why the relationship exists. If you cannot justify an edge, omit it.'),
        operations: z.array(BatchOperationSchema),
      }),
      execute: async ({ summary, reasoning, operations }) => {
        const schemaVersion = getSchemaVersion(user.id)
        const fullSummary = reasoning.trim() ? `${summary}\n\n${reasoning}` : summary
        const proposal = createProposal(user.id, fullSummary, operations, schemaVersion)
        return { proposed: true, proposalId: proposal.id, summary }
      },
    }),

    proposeNodeType: tool({
      description:
        'Propose promoting a recurring Concept pattern into a named node type. Use this when you observe 5 or more Concept nodes with a similar structure that would benefit from a dedicated type. The user approves → the new type is registered and usable going forward.',
      inputSchema: z.object({
        name: z.string().describe('PascalCase type name e.g. EnergyLog, MoodEntry, BookNote'),
        typeSchema: z.record(z.string(), z.unknown()).describe('Expected properties and their value types as strings'),
        examples: z.array(z.number()).describe('IDs of existing Concept nodes that exemplify this pattern'),
        reason: z.string().describe('Why this pattern deserves its own type'),
      }),
      execute: async ({ name, typeSchema, examples, reason }) => {
        const schemaVersion = getSchemaVersion(user.id)
        const proposal = createProposal(
          user.id,
          `Promote pattern to new type: ${name}`,
          [{ kind: 'proposeNodeType', name, typeSchema, examples, reason }],
          schemaVersion,
        )
        return { proposed: true, proposalId: proposal.id, summary: proposal.summary }
      },
    }),
  }
}
