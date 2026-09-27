import { generateText, Output } from 'ai'
import { z } from 'zod'
import { defaultModel } from '@/lib/ai/client'
import { createEdge, findExistingEdge, getEdges, getNodeById, getNodes } from '@/lib/graph/queries'
import { createProposal } from '@/lib/db/proposals'
import { hiddenTypes } from '@/lib/modules'
import { readSettings } from '@/lib/settings'
import { getSchemaVersion } from '@/lib/db/node-types'
import type { Edge, Node } from '@/lib/db/schema'

/**
 * "Does this new thing belong to anything already in the graph?"
 *
 * Used from two places, which is why it takes its candidates as an argument:
 * once per item the user creates by hand (src/app/api/quick-add, the calendar's
 * event dialog), and in bulk from the weekly sweep (src/lib/ai/graph-sweep.ts),
 * which reads the graph once and then asks about many nodes.
 */

/** Things the user creates that are worth trying to place in the graph. */
export const LINKABLE_SUBJECTS = new Set([
  'Event', 'Note', 'JournalEntry', 'Task', 'Habit',
  'Goal', 'Project', 'Course', 'Exam', 'Assignment',
  'ContentPiece', 'ContentSeries', 'HealthMetric',
])

/** What something can sensibly belong to, serve, or be about. */
const CANDIDATE_TYPES = new Set([
  'Goal', 'Project', 'Course', 'Task', 'Habit', 'Exam', 'Assignment',
  'ContentSeries', 'ContentPiece', 'Event', 'Note',
])

/** Enough for the model to see the user's world without paying for all of it. */
const MAX_CANDIDATES = 150

/** Properties that say what a thing *is*; the rest is bookkeeping and noise. */
const MEANINGFUL = [
  'name', 'title', 'label', 'description', 'notes', 'content',
  'date', 'time', 'dueDate', 'targetDate', 'publishDate',
  'location', 'platform', 'format', 'stage', 'status', 'frequency', 'mood',
] as const

const EDGE_TYPES = ['part-of', 'supports', 'prepares-for', 'about', 'related-to'] as const

const Suggested = z.object({
  links: z
    .array(
      z.object({
        targetId: z.number().int(),
        type: z.enum(EDGE_TYPES),
        reason: z.string().describe('One sentence, specific to these two items'),
      }),
    )
    .max(3),
})

/**
 * Relationships that describe a hierarchy. A -> B and B -> A cannot both be
 * true of these: a course is not part of its own lecture.
 */
const HIERARCHICAL = new Set(['part-of', 'supports', 'prepares-for'])

const SYSTEM = `The user just created something. Decide whether it clearly relates to any of their existing items.

Link only when the connection is obvious from the names and details:
- "CS101 study group" -> the CS101 Course (part-of)
- "Long run" -> a "Run a half marathon" Goal (supports)
- "Revision session" two days before an Exam -> that Exam (prepares-for)
- A note titled "Thesis outline" -> the thesis Project (about)
- "Dentist", "Dinner with Sam", "Random thought" -> usually nothing

Direction is always new item -> existing item. part-of: a piece or session of a course/project/series. supports: advances a goal or habit. prepares-for: comes before an exam, deadline or launch. about: a note or journal entry concerning something. related-to: anything else clearly connected.

Do NOT link two things that are merely the same KIND of thing. Two daily habits are not related because both are daily; two projects are not related because both involve design; one task does not "support" another simply because they are about the same subject. part-of and supports go UPWARDS, from a smaller thing to the larger thing it serves -- never sideways between siblings, and never between two items of the same type unless one genuinely contains the other.

Usually 0 or 1 links, never more than 3. Return an empty list when unsure -- a wrong link is worse than none, and most items need no link at all.`

function nameOf(p: Record<string, unknown>, fallback: string) {
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : typeof p.label === 'string' ? p.label : fallback
}

/** A compact, model-readable version of a node — long note bodies clipped. */
function describe(node: Node): Record<string, unknown> {
  const p = node.properties as Record<string, unknown>
  const out: Record<string, unknown> = { type: node.type }
  for (const key of MEANINGFUL) {
    const value = p[key]
    if (value === undefined || value === null || value === '') continue
    out[key] = typeof value === 'string' ? value.slice(0, 400) : value
  }
  return out
}

export interface LinkOutcome {
  /** Edges written straight into the graph, in `auto` mode. */
  linked: number
  /** Those edges, so a caller linking many nodes can keep its picture current. */
  created: Edge[]
  /** A proposal was queued for the user to approve, in `suggest` mode. */
  proposed: boolean
  proposalId?: number
  /** What it was linked (or proposed to be linked) to, for the toast. */
  names: string[]
}

const NOTHING: LinkOutcome = { linked: 0, created: [], proposed: false, names: [] }

export type LinkMode = 'off' | 'suggest' | 'auto'

/**
 * Looks for links from one node, and either writes them or proposes them.
 *
 * `auto` writes the edges directly. That is a deliberate exception to the
 * app's propose-then-approve rule for AI writes: an edge is additive, always
 * visible in the graph, and removable in one click from the node panel —
 * unlike creating or rewriting a node, there is nothing to undo badly. The
 * user chooses between the two in Settings.
 */
export async function linkNode(
  userId: number,
  nodeId: number,
  mode: LinkMode = 'suggest',
  preloaded?: { candidates?: Node[]; edges?: Edge[] },
): Promise<LinkOutcome> {
  if (mode === 'off') return NOTHING
  if (!process.env.OPENAI_API_KEY) return NOTHING

  const node = await getNodeById(userId, nodeId)
  if (!node) return NOTHING

  /*
   * Nothing from a switched-off module, in either direction. Linking to a
   * content series the user cannot see would put an edge in their graph
   * pointing at something the app is pretending does not exist.
   */
  const off = hiddenTypes(await readSettings(userId))
  if (off.has(node.type)) return NOTHING

  const pool = preloaded?.candidates ?? (await getNodes(userId))
  const candidates = pool
    .filter((n) => n.id !== nodeId && CANDIDATE_TYPES.has(n.type) && !off.has(n.type))
    .filter((n) => {
      const p = n.properties as Record<string, unknown>
      if (n.type === 'Task') return p.status !== 'done'
      if (n.type === 'Goal' || n.type === 'Project') return p.status !== 'completed'
      return true
    })
    .sort((a, b) => b.id - a.id)
    .slice(0, MAX_CANDIDATES)
  if (candidates.length === 0) return NOTHING

  const allEdges = preloaded?.edges ?? (await getEdges(userId))
  const alreadyLinked = new Set(
    allEdges
      .filter((e) => e.sourceId === nodeId || e.targetId === nodeId)
      .map((e) => (e.sourceId === nodeId ? e.targetId : e.sourceId)),
  )

  const { output } = await generateText({
    model: defaultModel,
    system: SYSTEM,
    output: Output.object({ schema: Suggested }),
    prompt: [
      `New item: ${JSON.stringify(describe(node))}`,
      '',
      'Existing items (id · type · name · date if any):',
      ...candidates.map((c) => {
        const p = c.properties as Record<string, unknown>
        const when = p.dueDate ?? p.date ?? p.targetDate
        return `${c.id} · ${c.type} · ${nameOf(p, `#${c.id}`)}${when ? ` · ${when}` : ''}`
      }),
    ].join('\n'),
  })

  const byId = new Map(candidates.map((c) => [c.id, c]))
  const seen = new Set<number>()
  // The model only ever sees ids from the list; anything else is discarded.
  const links = output.links.filter((l) => {
    if (!byId.has(l.targetId) || alreadyLinked.has(l.targetId) || seen.has(l.targetId)) return false
    seen.add(l.targetId)
    return true
  })
  if (links.length === 0) return NOTHING

  const names = links.map((l) => nameOf(byId.get(l.targetId)!.properties as Record<string, unknown>, `#${l.targetId}`))

  if (mode === 'auto') {
    const created: Edge[] = []
    for (const l of links) {
      // Belt and braces: `alreadyLinked` ignores edge type, this catches an
      // identical edge written by something else since the read above.
      if (await findExistingEdge(userId, nodeId, l.targetId, l.type)) continue
      /*
       * And the same relationship the other way round. Asked about a lecture
       * the model says it is part-of the course; asked about the course a
       * moment later it says the course is part-of the lecture, because each
       * question is answered on its own. Both were written, and a course
       * ended up inside its own lecture.
       */
      if (HIERARCHICAL.has(l.type) && await findExistingEdge(userId, l.targetId, nodeId, l.type)) continue
      // Marked as the assistant's work so the node panel can say where the
      // edge came from, and the sweep can tell its own links from the user's.
      created.push(await createEdge(userId, nodeId, l.targetId, l.type, { auto: true, reason: l.reason }))
    }
    return { linked: created.length, created, proposed: false, names }
  }

  const subjectName = nameOf(node.properties as Record<string, unknown>, `${node.type} #${nodeId}`)
  const proposal = await createProposal(
    userId,
    `Link "${subjectName}" to ${names.join(', ')}\n\n${links.map((l) => l.reason).join('\n')}`,
    links.map((l) => ({ kind: 'createEdge' as const, sourceRef: String(nodeId), targetRef: String(l.targetId), type: l.type })),
    await getSchemaVersion(userId),
  )
  return { linked: 0, created: [], proposed: true, proposalId: proposal.id, names }
}

/**
 * The original event-only entry point, kept for the calendar's links route.
 * Same shape the dialog's toast already reads.
 */
export async function proposeLinks(
  userId: number,
  nodeId: number,
  mode: LinkMode = 'suggest',
): Promise<{ proposed: boolean; linked?: number; proposalId?: number; names?: string[] }> {
  const out = await linkNode(userId, nodeId, mode)
  return { proposed: out.proposed, linked: out.linked, proposalId: out.proposalId, names: out.names }
}
