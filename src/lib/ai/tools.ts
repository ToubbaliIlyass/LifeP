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

const IntentSchema = z
  .enum(['auto', 'proposed'])
  .describe(
    '"auto" executes immediately; "proposed" queues for user approval. Use "proposed" for structural changes (new goals, deleting anything, new top-level nodes). Use "auto" for lightweight annotations like tags or notes.',
  )

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
        'Create a single node. Use intent="auto" for annotations/notes on existing concepts. Use intent="proposed" for new structural entities (Goals, Habits, Tasks, Projects).',
      inputSchema: z.object({
        type: z.string(),
        properties: z.record(z.string(), z.unknown()),
        intent: IntentSchema,
      }),
      execute: async ({ type, properties, intent }) => {
        if (intent === 'auto') {
          if (properties.name) {
            const existing = getNodes(user.id, { type }).find(
              (n) => (n.properties as Record<string, unknown>).name === properties.name,
            )
            if (existing) return { created: false, node: existing, deduplicated: true }
          }
          const node = createNode(user.id, type, properties)
          return { created: true, node }
        }
        const proposal = createProposal(user.id, `Create ${type} node`, [
          { kind: 'createNode', type, properties },
        ])
        return { proposed: true, proposalId: proposal.id, summary: proposal.summary }
      },
    }),

    createEdge: tool({
      description:
        'Create an edge between two existing nodes. Use intent="auto" when linking nodes that already exist. Use intent="proposed" when the relationship involves new top-level entities.',
      inputSchema: z.object({
        sourceId: z.number().describe('Source node ID'),
        targetId: z.number().describe('Target node ID'),
        type: z.string().describe('Relationship type e.g. supports, blocks, part-of'),
        properties: z.record(z.string(), z.unknown()).optional(),
        intent: IntentSchema,
      }),
      execute: async ({ sourceId, targetId, type, properties, intent }) => {
        if (intent === 'auto') {
          const edge = createEdge(user.id, sourceId, targetId, type, properties ?? {})
          return { created: true, edge }
        }
        const proposal = createProposal(
          user.id,
          `Create "${type}" edge between nodes ${sourceId} and ${targetId}`,
          [{ kind: 'createEdge', sourceRef: String(sourceId), targetRef: String(targetId), type, properties }],
        )
        return { proposed: true, proposalId: proposal.id, summary: proposal.summary }
      },
    }),

    updateNodeProperties: tool({
      description:
        'Update properties on an existing node. Use intent="auto" for adding tags, notes, or labels. Use intent="proposed" for changing the name, type, or core structural fields.',
      inputSchema: z.object({
        nodeId: z.number(),
        properties: z.record(z.string(), z.unknown()),
        intent: IntentSchema,
      }),
      execute: async ({ nodeId, properties, intent }) => {
        if (intent === 'auto') {
          const node = updateNode(user.id, nodeId, properties)
          return node ? { updated: true, node } : { updated: false, error: 'Node not found' }
        }
        const proposal = createProposal(user.id, `Update properties on node ${nodeId}`, [
          { kind: 'updateNode', nodeId, properties },
        ])
        return { proposed: true, proposalId: proposal.id, summary: proposal.summary }
      },
    }),

    deleteNode: tool({
      description: 'Propose deletion of a node and its edges. Always queued for user approval.',
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
        'Propose a set of related graph changes as a single atomic proposal the user can approve or reject together. Use this when creating multiple nodes and edges that form a coherent concept (e.g., a goal + supporting habits + edges). createEdge entries can reference createNode results by "$0", "$1", etc. (0-indexed, counting only createNode operations in order).',
      inputSchema: z.object({
        summary: z.string().describe('Human-readable summary of what this batch does'),
        operations: z.array(BatchOperationSchema),
      }),
      execute: async ({ summary, operations }) => {
        const schemaVersion = getSchemaVersion(user.id)
        const proposal = createProposal(user.id, summary, operations, schemaVersion)
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
