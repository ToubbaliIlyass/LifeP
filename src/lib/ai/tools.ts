import { tool } from 'ai'
import { z } from 'zod'
import type { CurrentUser } from '@/lib/auth/getCurrentUser'
import { createIdentity } from '@/lib/identity-write'
import { AreasInputSchema, compileAreas, compilePlan, critiquePlan, PlanInputSchema } from '@/lib/plan-compile'
import { compileReorganise, ReorganiseInputSchema } from '@/lib/reorganise'
import { organisationSnapshot } from '@/lib/reorganise-data'
import { getNodes as getAllNodes, getEdges, createNode, createEdge, updateNode, findExistingEdge, deleteNode as removeNode, getNodeById } from '@/lib/graph/queries'
import { createProposal, getPendingProposals, rejectProposal } from '@/lib/db/proposals'
import { getSchemaVersion } from '@/lib/db/node-types'
import { saveMemories, MEMORY_CATEGORIES } from '@/lib/memory'
import { identityOf, needsIdentity } from '@/lib/graph/naming'
import { saveRule } from '@/lib/availability'
import { logActivity } from '@/lib/day-log'
import { skipTask } from '@/lib/skip-server'
import { resolveEvent } from '@/lib/event-status-server'
import { hiddenTypes, moduleProposeTypes, type ModuleAware } from '@/lib/modules'
import { replanDay } from '@/lib/schedule-day'
import { dayView } from '@/lib/day-view'
import { clockIn, type UserClock } from '@/lib/clock'

/*
 * Never readable or writable through the assistant: token hashes, and the raw
 * signal log (it is summarised into context instead). Matters more now that
 * these tools are also reachable by outside chatbots over MCP.
 */
const PRIVATE_TYPES = new Set(['ApiToken', 'ActivitySignal', 'Settings', 'CanvasCredential', 'PushDevice', 'AiUsage'])

/**
 * Every read the assistant makes, minus what it may not see.
 *
 * `off` is the node types of switched-off modules. A module that is off does
 * not exist as far as the assistant is concerned: it cannot read those nodes,
 * so it cannot mention, link, reschedule or offer to tidy them, and it never
 * learns that a user who turned the content hub off once had videos.
 */
const visibleNodes = (off: Set<string>): typeof getAllNodes => async (userId, filter) =>
  (await getAllNodes(userId, filter)).filter((n) => !PRIVATE_TYPES.has(n.type) && !off.has(n.type))

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM, 24h')

export const BatchOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('createNode'),
    type: z.string().describe('Node type e.g. Goal, Task, Event, Concept'),
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
    // Filled in by the server when the proposal is made: what those fields were then. Not the model's to write.
    expect: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    // Takes an existing link away: the other half of moving a to-do from one
    // list to another, which without it would leave the to-do in both.
    kind: z.literal('deleteEdge'),
    sourceRef: z.string().regex(/^\d+$/, 'An existing node id, e.g. "42"'),
    targetRef: z.string().regex(/^\d+$/, 'An existing node id, e.g. "42"'),
    type: z.string().describe('The edge type to remove, e.g. part-of'),
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

/*
 * Structural types must go through batchPropose — createNode rejects these
 * directly. A module's own structural types are added by the registry while
 * it is on, and are refused outright while it is off.
 */
const ALWAYS_PROPOSE_TYPES = new Set(['Goal', 'Task', 'Project', 'Event'])
/** Written only through their own tools, which validate the shape. */
const DEDICATED_TOOL_TYPES = new Set(['Memory', 'AvailabilityRule', ...PRIVATE_TYPES])

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

/** How many times a plan for the same project has been sent back for fixing, so it is never sent back for ever. */
const planRetries = new Map<string, { n: number; at: number }>()

// The authenticated user is passed in rather than resolved here: the caller
// has already established who this is, and every tool below scopes its
// writes to that id.
export function buildTools(
  user: CurrentUser,
  settings?: ModuleAware,
  options: {
    /** The user's own date and time — see src/lib/clock.ts. */
    clock?: UserClock
    /**
     * Tasks and one-off Events are created straight away instead of queued.
     *
     * For the in-app assistant only: the point of it is "I tell it what has
     * to happen today and it is on my day" — a proposal to approve before
     * anything can be planned is the step that loop cannot have. Each one is
     * shown as a card in the chat and is one click to remove. Goals,
     * Projects and recurring Events still arrive as proposals, being the
     * kind of thing a misheard sentence should not create unnoticed; and an
     * outside chatbot over MCP gets none of this.
     */
    directTasks?: boolean
  } = {},
) {
  const off = hiddenTypes(settings)
  const getNodes = visibleNodes(off)
  const direct = options.directTasks === true
  const mustPropose = new Set([...ALWAYS_PROPOSE_TYPES, ...moduleProposeTypes(settings)])
  if (direct) { mustPropose.delete('Task'); mustPropose.delete('Event') }
  const clockNow = () => options.clock ?? clockIn()

  return {
    readGraph: tool({
      description:
        'Read the knowledge graph when you need node IDs or a type you cannot see in the Graph snapshot. The snapshot in your system context already lists the user\'s active Goals, Projects, Courses and open Tasks with their IDs — do NOT call this tool to re-read what is already there. Returns compact summaries, not full node bodies; use getNodeDetail for one node\'s full properties.',
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
        direct
          ? 'Create a single node immediately. Use it for Tasks and one-off Events the user mentions (then call planDay), and for Notes and Concepts. Goals, Projects, recurring Events, Courses, Exams and Assignments MUST go through batchPropose — this tool rejects them.'
          : 'Create a single node immediately (intent="auto" only). For structural entities (Goal, Task, Project, Event, Course, Exam, Assignment) you MUST use batchPropose instead — calling this tool for those types will be rejected.',
      inputSchema: z.object({
        type: z.string(),
        properties: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ type, properties }) => {
        if (off.has(type)) {
          return { error: `This user does not use ${type}. Nothing was created.` }
        }
        if (mustPropose.has(type)) {
          return { error: `Cannot create ${type} directly. Use batchPropose with a createNode operation instead.` }
        }
        // A one-off event is a thing on a day; a recurring one is a standing
        // commitment, and those are still the user's to approve.
        if (type === 'Event' && typeof properties.frequency === 'string' && properties.frequency !== 'once') {
          return { error: 'A recurring Event goes through batchPropose. Only one-off Events are created directly.' }
        }
        if (type === 'Task') {
          properties = { status: 'todo', priority: 'medium', ...properties }
        }
        if (DEDICATED_TOOL_TYPES.has(type)) {
          return { error: `Cannot create ${type} with createNode. Use remember or rememberAvailability.` }
        }
        if (needsIdentity(type) && !identityOf(properties)) {
          return { error: `A ${type} needs a name, title or label. Nothing was created.` }
        }
        if (properties.name) {
          // A finished task is not the same one: "buy milk" again next week
          // is new work, not the old done row handed back.
          const existing = (await getNodes(user.id, { type })).find((n) => {
            const np = n.properties as Record<string, unknown>
            return np.name === properties.name && !(type === 'Task' && np.status === 'done')
          })
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
        'Update properties on an existing node immediately. Use for status changes, completions, grade updates, and lightweight field edits. For renames or core structural changes to important nodes, use batchPropose with an updateNode operation instead.',
      inputSchema: z.object({
        nodeId: z.number(),
        properties: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ nodeId, properties }) => {
        const existing = (await getNodes(user.id)).find((n) => n.id === nodeId)
        if (!existing || DEDICATED_TOOL_TYPES.has(existing.type)) return { updated: false, error: 'Node not found' }
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
        'Propose a set of related graph changes as a single atomic proposal the user can approve or reject together. Use this when creating structural nodes (Goal, Task, Project, Event, Course, Exam, Assignment) and their edges. createEdge entries can reference createNode results by "$0", "$1", etc. (0-indexed, counting only createNode operations in order). Requires a reasoning field explaining each edge.',
      inputSchema: z.object({
        summary: z.string().describe('One-sentence summary of what this batch does'),
        reasoning: z.string().describe('For each edge in this batch, one sentence explaining why the relationship exists. If you cannot justify an edge, omit it.'),
        operations: z.array(BatchOperationSchema),
      }),
      execute: async ({ summary, reasoning, operations }) => {
        // Remember what each field it would change is now, so approving later can tell a real change from noise.
        for (const op of operations) {
          if (op.kind !== 'updateNode') continue
          const node = await getNodeById(user.id, op.nodeId)
          const now = (node?.properties ?? {}) as Record<string, unknown>
          op.expect = Object.fromEntries(Object.keys(op.properties).map((k) => [k, now[k] ?? null]))
        }
        const schemaVersion = await getSchemaVersion(user.id)
        const fullSummary = reasoning.trim() ? `${summary}\n\n${reasoning}` : summary
        const proposal = await createProposal(user.id, fullSummary, operations, schemaVersion)
        return { proposed: true, proposalId: proposal.id, summary }
      },
    }),

    readOrganisation: tool({
      description:
        'Read how the user\'s lists are organised, for tidying: every area and project (id, title, kind, which area it sits under, how many open to-dos) and their open to-dos (id, title, which list, tags, day), loose ones first. Call it once, before proposeReorganise, and use these ids exactly.',
      inputSchema: z.object({}),
      execute: async () => {
        const snap = await organisationSnapshot(user.id, clockNow().date)
        const open = snap.todos.filter((t) => !t.done && t.type === 'Task')
        const count = new Map<number, number>()
        for (const t of open) if (t.listId !== null) count.set(t.listId, (count.get(t.listId) ?? 0) + 1)
        const listTitle = new Map(snap.lists.map((l) => [l.id, l.title]))
        const loose = open.filter((t) => t.listId === null)
        const filed = open.filter((t) => t.listId !== null)
        return {
          lists: snap.lists.map((l) => ({ id: l.id, title: l.title, kind: l.kind, areaId: l.areaId, open: count.get(l.id) ?? 0 })),
          todos: [...loose, ...filed].slice(0, 120).map((t) => ({ id: t.id, title: t.title, list: t.listId, listTitle: t.listId !== null ? listTitle.get(t.listId) ?? null : null, tags: snap.tags.get(t.id) ?? [], day: snap.due.get(t.id) ?? null })),
          omitted: Math.max(0, open.length - 120),
        }
      },
    }),

    proposeReorganise: tool({
      description:
        'Propose REARRANGING what the user already has so it makes more sense: move open to-dos into the right area or project, make a few new projects or areas to hold groups that belong together, RENAME a list to a clearer name, and MERGE two lists of the same kind that are really one (everything in the first goes into the second and the empty one is removed). Call readOrganisation first and use its ids exactly. It never touches finished things or deletes anything but the emptied list of a merge; at most 25 moves, 6 new lists, 8 renames, 4 merges, and only where it clearly helps: loose to-dos that belong with a project, a project that belongs under an area, five to-dos about the same thing with no home, "Work" and "Job" being the same area, a name like "misc 2" that says nothing. It writes nothing: the user sees each change (from, to) in To review and can untick any before it is applied, and can undo all of it. Reply in one or two sentences: what will be better, and what changes; never list them.',
      inputSchema: ReorganiseInputSchema,
      execute: async (input) => {
        const snap = await organisationSnapshot(user.id, clockNow().date)
        let compiled
        try {
          compiled = compileReorganise(input, snap)
        } catch (error) {
          return { proposed: false, error: error instanceof Error ? error.message : 'That could not be arranged.' }
        }
        const proposal = await createProposal(user.id, compiled.summary, compiled.operations, await getSchemaVersion(user.id))
        return { proposed: true, proposalId: proposal.id, summary: compiled.summary.split('\n\n')[0], moved: compiled.moved, renamed: compiled.renamed, merged: compiled.merged, skipped: compiled.skipped }
      },
    }),

    proposeAreas: tool({
      description:
        'Set up AREAS OF LIFE (Health, Career, Money, Relationships, Learning, Home, Creative…) and, under each, the real projects the user mentioned. Use it when they say "organise my life", "set up my areas", "add a Health area", or list the parts of their life. Areas are the lists in the sidebar that projects and to-dos sit under. One to eight areas, each with at most three projects they actually named (never filler like "Goals"). It skips what they already have and says so. Nothing is added until they say yes in the review. Use proposePlan, not this, for a goal with steps.',
      inputSchema: AreasInputSchema,
      execute: async (input) => {
        const goals = await getAllNodes(user.id, { type: 'Goal' })
        const projects = await getAllNodes(user.id, { type: 'Project' })
        const links = (await getEdges(user.id)).filter((e) => e.type === 'part-of')
        const areaOf = (id: number) => links.find((e) => e.sourceId === id && goals.some((g) => g.id === e.targetId))?.targetId ?? null
        let compiled
        try {
          compiled = compileAreas(input, {
            areas: goals.map((g) => ({ id: g.id, name: String((g.properties as Record<string, unknown>).name ?? '') })),
            projects: projects.map((p) => ({ name: String((p.properties as Record<string, unknown>).name ?? ''), areaId: areaOf(p.id) })),
          })
        } catch (error) {
          return { proposed: false, error: error instanceof Error ? error.message : 'That could not be made.' }
        }
        const proposal = await createProposal(user.id, compiled.summary, compiled.operations, await getSchemaVersion(user.id))
        return { proposed: true, proposalId: proposal.id, summary: compiled.summary.split('\n\n')[0], skipped: compiled.skipped }
      },
    }),

    proposePlan: tool({
      description:
        'Turn a goal that needs several steps or time into a PLAN the user reviews before anything is added: a project (optionally under one of their areas, or one new area), optionally split into phases (headings), and up to 25 concrete steps, each with the day it starts (offsets from today, 0 = today), a length in minutes, a priority, an optional checklist, and, for routines, how it repeats (daily, weekdays, or weekly on given days). Follow the planning rules in your instructions: start from the outcome and the date, use what you know about their week, make the first step tiny and soon, one step per routine (never one per day), leave rest days, no more than three one-offs on a day, concrete verb-first titles. Not for a single to-do (createNode), a one-off event, or setting up areas of life (proposeAreas). It writes nothing: the user sees the plan in To review and can untick steps. After it, reply in one or two sentences: what the plan is, the first step and when, and what you assumed.',
      inputSchema: PlanInputSchema,
      execute: async (input) => {
        // The shape of the plan is checked first. A plan that is all routines, starts nowhere soon, is long with
        // no phases, or has the same routine overlapping itself is sent back to be fixed, twice at most, and
        // then shown with what is left said plainly: the user is never stuck behind it.
        const key = `${user.id}:${input.project.name.trim().toLowerCase()}`
        const issues = critiquePlan(input)
        const tries = planRetries.get(key)
        const attempt = tries && Date.now() - tries.at < 10 * 60_000 ? tries.n : 0
        if (issues.length && attempt < 2) {
          planRetries.set(key, { n: attempt + 1, at: Date.now() })
          return { proposed: false, revise: true, error: `Fix this and call proposePlan again with the whole improved plan: ${issues.join(' ')}` }
        }
        planRetries.delete(key)
        const areaIds = new Set((await getAllNodes(user.id, { type: 'Goal' })).map((n) => n.id))
        let compiled
        try {
          compiled = compilePlan(input, { today: clockNow().date, areaIds })
        } catch (error) {
          return { proposed: false, error: error instanceof Error ? error.message : 'That plan could not be made.' }
        }
        // A newer plan for the same project replaces the one still waiting, so the queue never holds two of the same.
        const name = String((compiled.operations.find((o) => o.kind === 'createNode' && o.type === 'Project') as { properties: Record<string, unknown> } | undefined)?.properties.name ?? '').toLowerCase()
        for (const waiting of await getPendingProposals(user.id)) {
          const first = (waiting.operations as BatchOperation[]).find((o) => o.kind === 'createNode' && o.type === 'Project') as { properties: Record<string, unknown> } | undefined
          if (first && String(first.properties.name ?? '').toLowerCase() === name) await rejectProposal(waiting.id, user.id, 'Replaced by a newer plan')
        }
        const proposal = await createProposal(user.id, compiled.summary, compiled.operations, await getSchemaVersion(user.id))
        return { proposed: true, proposalId: proposal.id, summary: compiled.summary.split('\n\n')[0], steps: compiled.operations.filter((o) => o.kind === 'createNode' && o.type === 'Task').length, warnings: compiled.warnings }
      },
    }),

    ...(direct ? {
      planDay: tool({
        description:
          'Lay out a day on the calendar and write it: everything due that day (and overdue), and — if there is room — work due in the next few days, fitted around events, fixed commitments and the hours already gone. Replaces the day\'s earlier tentative plan; times the user agreed to are never moved. Call it after adding what the user said needs doing that day. Returns what was placed, in time order, and what did not fit with the reason.',
        inputSchema: z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; defaults to today'),
        }),
        execute: async ({ date }) => {
          const clock = clockNow()
          const day = date ?? clock.date
          if (day < clock.date) return { error: 'That day has already gone and cannot be planned.' }
          const r = await replanDay(user.id, day, clock)
          return {
            date: r.date,
            planned: r.placements.map((p) => ({ start: p.startTime, end: p.endTime, what: p.name, kind: p.kind, why: p.reason })),
            noRoomFor: r.unplaced.map((u) => ({ what: u.name, why: u.reason })),
          }
        },
      }),

      addIdentity: tool({
        description:
          'Add who the user is becoming, when they say it: "I want to be a runner", "I\'m trying to become someone who writes", "I want to be more present". One entry per person, short, finishing "I\'m becoming …" ("a runner", "someone who writes", "calm"); a goal like "run a marathon" becomes the person it makes ("a runner"). Immediate: it is gentle and one tap to forget. It looks through their areas, projects, to-dos and tags and fills in what counts toward each; the result says which, so mention them in one short sentence. Not for tasks or plans.',
        inputSchema: z.object({
          names: z.array(z.string().min(2).max(80)).min(1).max(5).describe('The identities, lower case, each finishing "I\'m becoming …"'),
        }),
        execute: async ({ names }) => {
          const added: { name: string; counts: string[]; already?: boolean }[] = []
          for (const name of names) {
            const r = await createIdentity(user.id, name, { listIds: [], itemIds: [], tags: [] }, { auto: true })
            added.push({ name: r.identity.name, counts: r.sources.map((x) => x.label), ...(r.created ? {} : { already: true }) })
          }
          return { added }
        },
      }),

      getDay: tool({
        description:
          'Read one day back: what is on the calendar in time order (events, planned blocks), what is due but has no time yet, and the five prayers when they are on. Use it for "what do I have to do today/tomorrow?" and before talking about the user\'s day.',
        inputSchema: z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; defaults to today'),
        }),
        execute: async ({ date }) => dayView(user.id, date ?? clockNow().date),
      }),
    } : {}),

    remember: tool({
      description:
        'Quietly save a lasting fact about the user to long-term memory: a goal, project, routine, preference, constraint or other durable detail ("prefers deep work before noon", "is studying for the bar exam"). Not for one-off tasks or anything already in memory. Do NOT tell the user you saved it.',
      inputSchema: z.object({
        text: z.string().min(3).describe('One short third-person sentence'),
        category: z.enum(MEMORY_CATEGORIES),
      }),
      execute: async ({ text, category }) => {
        const { saved } = await saveMemories(user.id, [{ text, category }], 'chat')
        return { saved: saved > 0, duplicate: saved === 0 }
      },
    }),

    logActivity: tool({
      description:
        'Quietly record something the user says they DID — "went to the gym at 7", "finished the Silkor SEO", "did 2 hours of study this afternoon", "went for a walk after lunch". This is how the app learns when things really happen, including things never put on the calendar. Pass nodeId when it is a Task you can see in the graph; that also marks it done. For something that is not tracked, just describe it in `what` — repeated ones get offered as repeating to-dos later. Log each separate activity with its own call. ALWAYS pass start (and end, when you know it): the time is written onto that day\'s calendar, moving the block if it was planned elsewhere and adding one if it was never planned, so the day on screen matches the day that happened. Use approximate:true when the time is vague ("this morning"). Do NOT use remember for daily events, and do NOT announce that you logged anything; only mention it if a task got marked done.',
      inputSchema: z.object({
        what: z.string().min(1).describe('What they did, in their words'),
        nodeId: z.number().optional().describe('The Task it was, when you know it'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; omit for today'),
        start: HHMM.optional(),
        end: HHMM.optional(),
        approximate: z.boolean().optional().describe('true when the time is a guess from words like "this morning"'),
        completed: z.boolean().optional().describe('false if they only worked on it without finishing'),
      }),
      execute: async (input) => logActivity(user.id, input),
    }),

    skipOccurrence: tool({
      description:
        'Skip ONE time round of a repeating Task ("skip my run today", "not doing the stretching today"): it leaves today and comes back on its next day by its own rule. This is not completing it and not deleting it, so never use updateNodeProperties or logActivity for that. Only for a Task that has a recurrence; a one-off cannot be skipped. If it is the last time round before its deadline, it says so and nothing changes.',
      inputSchema: z.object({ nodeId: z.number().describe('The repeating Task') }),
      execute: async ({ nodeId }) => {
        const r = await skipTask(user.id, nodeId, { today: clockNow().date })
        return r.ok ? { skipped: true, wasFor: r.from, nextOn: r.to } : { skipped: false, reason: r.reason }
      },
    }),

    resolveEvent: tool({
      description:
        'Settle ONE day of an Event (never the whole series): status "attended" when they went ("I went to the dentist", "class done"), "cancelled" when someone called it off, "missed" when they did not go. It leaves that day\'s list and stops reminding; nothing is deleted, and none of it counts against them, so never use updateNodeProperties, deleteNode or logActivity for this. status null puts it back. date defaults to today.',
      inputSchema: z.object({
        nodeId: z.number().describe('The Event'),
        status: z.enum(['attended', 'cancelled', 'missed']).nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('The day it was on; today when omitted'),
      }),
      execute: async ({ nodeId, status, date }) => {
        const r = await resolveEvent(user.id, nodeId, date ?? clockNow().date, status)
        return r.ok ? { resolved: true, date: r.date, status: r.status } : { resolved: false, reason: r.reason }
      },
    }),

    rememberAvailability: tool({
      description:
        'Quietly record a GENERAL RULE about the user\'s week, so scheduling respects it. Use for open-ended statements like "I work 9-5 on weekdays" (busy), "evenings are my free time" (free), "I go to the gym at 7am" (prefer, activity "gym"). NOT for a specific named commitment — a shift, a class, a lecture, a standing meeting — which is a recurring Event created with batchPropose so it lands on the calendar where it can be seen and changed. The test: if it would have a name on a calendar, it is an Event, not a rule. Same-day ranges only. Give the same `note` when restating a fact you have recorded before ("CLE shift") — a matching note replaces the old rule instead of adding a second one, which is how a corrected day stops the old day being blocked. Do NOT tell the user you saved it.',
      inputSchema: z.object({
        kind: z.enum(['busy', 'free', 'prefer']),
        days: z.array(z.number().int().min(0).max(6)).describe('0=Sun … 6=Sat. Empty array = every day.'),
        start: HHMM,
        end: HHMM,
        activity: z.string().optional().describe('For kind "prefer": what this time is good for, matched against to-do names'),
        note: z.string().optional().describe('e.g. "work", "class"'),
      }),
      execute: async ({ kind, days, start, end, activity, note }) => {
        if (end <= start) return { saved: false, error: 'end must be after start on the same day; split overnight ranges in two' }
        // Restating a rule corrects it rather than adding a second copy —
        // see saveRule in src/lib/availability.ts.
        const { id, replaced } = await saveRule(user.id, { kind, days, start, end, activity, note })
        return { saved: true, id, ...(replaced.length ? { replaced } : {}) }
      },
    }),

    forget: tool({
      description: 'Remove a memory or availability rule (by its id from context or getMemory) that is wrong or no longer true. Immediate.',
      inputSchema: z.object({ id: z.number() }),
      execute: async ({ id }) => {
        const node = await getNodeById(user.id, id)
        if (!node || (node.type !== 'Memory' && node.type !== 'AvailabilityRule')) {
          return { removed: false, error: 'No memory or availability rule with that id' }
        }
        await removeNode(user.id, id)
        return { removed: true }
      },
    }),
  }
}
