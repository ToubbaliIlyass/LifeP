import { tool } from 'ai'
import { z } from 'zod'
import type { CurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges, createNode, createEdge, updateNode, findExistingEdge } from '@/lib/graph/queries'
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
    // "$N" = Nth createNode result in this batch (0-indexed). Plain number
    // string = existing node ID. The two are one character apart and mean
    // entirely different things, so both descriptions spell out the failure
    // mode — dropping the "$" silently pointed edges at ids 0,1,2… which are
    // never real rows. router.ts validates every ref before writing anything.
    sourceRef: z
      .string()
      .regex(/^(\$\d+|\d+)$/, 'Must be "$0" (a node this batch creates) or "42" (an existing node id)')
      .describe('"$0"/"$1" for a node CREATED IN THIS BATCH (0-indexed over createNode ops), or a bare id like "42" for an EXISTING node. The "$" is required for batch references.'),
    targetRef: z
      .string()
      .regex(/^(\$\d+|\d+)$/, 'Must be "$0" (a node this batch creates) or "42" (an existing node id)')
      .describe('"$0"/"$1" for a node CREATED IN THIS BATCH (0-indexed over createNode ops), or a bare id like "42" for an EXISTING node. The "$" is required for batch references.'),
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

// Tool results are billed as input tokens on every subsequent step, so they are
// projected down to what the model actually needs (identity + the few fields it
// reasons over) instead of the full row with timestamps and every property.
const READ_GRAPH_NODE_LIMIT = 60
const READ_GRAPH_EDGE_LIMIT = 80
const SEARCH_LIMIT = 20

const SUMMARY_KEYS = ['status', 'dueDate', 'date', 'targetDate', 'frequency', 'grade', 'code']

function compactNode(node: { id: number; type: string; properties: unknown }) {
  const p = (node.properties ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {
    id: node.id,
    type: node.type,
    name: p.name ?? p.title ?? `#${node.id}`,
  }
  for (const key of SUMMARY_KEYS) {
    if (p[key] !== undefined && p[key] !== null && p[key] !== '') out[key] = p[key]
  }
  return out
}

function compactEdge(edge: { id: number; sourceId: number; targetId: number; type: string }) {
  return { id: edge.id, from: edge.sourceId, to: edge.targetId, type: edge.type }
}

// The authenticated user is passed in rather than resolved here: the caller
// has already established who this is, and every tool below scopes its
// writes to that id.
export function buildTools(user: CurrentUser) {

  return {
    readGraph: tool({
      description:
        'Read the knowledge graph when you need node IDs or a type you cannot see in the Graph snapshot. The snapshot in your system context already lists the user\'s active Goals, Projects, Courses, Habits and open Tasks with their IDs — do NOT call this tool to re-read what is already there. Returns compact summaries, not full node bodies; use getNodeDetail for one node\'s full properties.',
      inputSchema: z.object({
        filter: z.string().optional().describe('e.g. "type:Goal" to get only goal nodes'),
      }),
      execute: async ({ filter }) => {
        let typeFilter: string | undefined
        if (filter?.startsWith('type:')) typeFilter = filter.slice(5)
        const allNodes = await getNodes(user.id, typeFilter ? { type: typeFilter } : undefined)
        const nodes = allNodes.slice(0, READ_GRAPH_NODE_LIMIT)
        const nodeIds = new Set(nodes.map((n) => n.id))
        const allEdges = (await getEdges(user.id)).filter(
          (e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId),
        )
        return {
          nodes: nodes.map(compactNode),
          edges: allEdges.slice(0, READ_GRAPH_EDGE_LIMIT).map(compactEdge),
          truncated:
            allNodes.length > nodes.length || allEdges.length > READ_GRAPH_EDGE_LIMIT
              ? `Showing ${nodes.length} of ${allNodes.length} nodes. Narrow with a type filter or use searchNodes.`
              : undefined,
        }
      },
    }),

    searchNodes: tool({
      description:
        'Search nodes by keyword in their properties. Prefer this over readGraph when you are looking for a specific node by name. Returns compact summaries.',
      inputSchema: z.object({
        query: z.string().describe('Text to search for in node properties'),
      }),
      execute: async ({ query }) => {
        const allNodes = await getNodes(user.id)
        const q = query.toLowerCase()
        const matches = allNodes.filter((n) =>
          JSON.stringify(n.properties).toLowerCase().includes(q),
        )
        return {
          nodes: matches.slice(0, SEARCH_LIMIT).map(compactNode),
          count: matches.length,
        }
      },
    }),

    getNodeDetail: tool({
      description:
        'Read the full properties of one node by ID. Use this only when the compact summary is not enough (e.g. you need a Note body or a description).',
      inputSchema: z.object({ nodeId: z.number() }),
      execute: async ({ nodeId }) => {
        const node = (await getNodes(user.id)).find((n) => n.id === nodeId)
        if (!node) return { found: false as const }
        return { found: true as const, id: node.id, type: node.type, properties: node.properties }
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
          const existing = (await getNodes(user.id, { type })).find(
            (n) => (n.properties as Record<string, unknown>).name === properties.name,
          )
          if (existing) return { created: false, node: compactNode(existing), deduplicated: true }
        }
        const node = await createNode(user.id, type, properties)
        return { created: true, node: compactNode(node) }
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
        const existing = await findExistingEdge(user.id, sourceId, targetId, type)
        if (existing) {
          return { created: false, edge: compactEdge(existing), duplicate: true }
        }
        const edge = await createEdge(user.id, sourceId, targetId, type, properties ?? {})
        return { created: true, edge: compactEdge(edge) }
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
        const existing = (await getNodes(user.id)).find((n) => n.id === nodeId)
        if (!existing) return { updated: false, error: 'Node not found' }
        const merged = { ...(existing.properties as Record<string, unknown>), ...properties }
        const node = await updateNode(user.id, nodeId, merged)
        return node
          ? { updated: true, node: compactNode(node), changed: Object.keys(properties) }
          : { updated: false, error: 'Node not found' }
      },
    }),

    deleteNode: tool({
      description: 'Propose deletion of a node and its edges. Always queued for user approval — use batchPropose with a deleteNode operation.',
      inputSchema: z.object({
        nodeId: z.number(),
        reason: z.string().describe('Why this node should be deleted'),
      }),
      execute: async ({ nodeId, reason }) => {
        const proposal = await createProposal(
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
        const schemaVersion = await getSchemaVersion(user.id)
        const fullSummary = reasoning.trim() ? `${summary}\n\n${reasoning}` : summary
        const proposal = await createProposal(user.id, fullSummary, operations, schemaVersion)
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
        const schemaVersion = await getSchemaVersion(user.id)
        const proposal = await createProposal(
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
