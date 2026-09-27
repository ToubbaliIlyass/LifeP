import { deleteEdge, getEdges, getNodes } from '@/lib/graph/queries'
import { LINKABLE_SUBJECTS, linkNode, type LinkMode } from '@/lib/ai/suggest-links'
import type { Edge, Node } from '@/lib/db/schema'

/**
 * The periodic tidy-up of the graph.
 *
 * Things arrive in this app one at a time — a note at midnight, an event
 * tapped onto the calendar, a task from a chat. Each is looked at once, on
 * the way in, against whatever existed at that moment. What that misses is
 * everything created *afterwards*: the note written in March genuinely is
 * about the project started in April, and nothing would ever notice.
 *
 * So every so often the whole graph gets another pass. It does two things:
 *
 *   tidy     drops duplicate and self-referential edges, which accumulate
 *            from re-proposals and from the same link being made twice
 *   connect  offers the still-unconnected nodes to the linker again, now
 *            that there is more for them to connect to
 *
 * Deliberately no writes beyond that: nothing is deleted, renamed, archived
 * or merged. A background job that rewrites content the user has not looked
 * at is how a planner loses someone's trust.
 */

/** Bookkeeping nodes, not part of the user's graph. Mirrors layout.ts. */
const BOOKKEEPING = new Set([
  'habitlog', 'timeblock', 'savedview', 'settings',
  'memory', 'availabilityrule', 'activitysignal', 'apitoken',
  'canvascredential',
])

/**
 * An edge that only records scheduling, not meaning — a node whose sole edge
 * is one of these is still unconnected as far as the graph is concerned.
 */
const STRUCTURAL_ONLY = new Set(['scheduled-for'])

/**
 * A ceiling on model calls per sweep. A graph with two hundred loose notes
 * should tidy itself over several weeks rather than in one expensive burst,
 * and newest-first means the ones the user is most likely to care about go
 * through first.
 */
const MAX_LINK_ATTEMPTS = 20

export interface SweepResult {
  ranAt: string
  /** Nodes offered to the linker this run. */
  scanned: number
  /** Edges written straight in (`auto` mode). */
  linked: number
  /** Proposals queued for approval (`suggest` mode). */
  proposed: number
  /** Duplicate and self-referential edges dropped. */
  tidied: number
  /** Still unconnected after this run — what a later sweep will pick up. */
  remaining: number
}

/**
 * Edge types that mean the same thing in either direction, so recording them
 * both ways says nothing twice — and draws two lines between the same pair
 * of nodes in the graph view.
 */
const SYMMETRIC = new Set(['related-to', 'linked-to', 'similar-to'])

/**
 * Relationships that describe a hierarchy. A -> B and B -> A cannot both be
 * true of these — a course is not part of its own lecture — so when both
 * exist the later one is a mistake, not a second fact.
 */
const HIERARCHICAL = new Set(['part-of', 'supports', 'prepares-for'])

/** Same relationship recorded more than once, or in both directions at once. */
function redundantEdges(edges: Edge[]): Edge[] {
  const keep = new Set<string>()
  const drop: Edge[] = []
  for (const e of [...edges].sort((a, b) => a.id - b.id)) {
    if (e.sourceId === e.targetId) { drop.push(e); continue }
    // Symmetric and hierarchical types are both keyed on the *unordered*
    // pair, so A->B and B->A collide and the later one goes. For a symmetric
    // type that is because the two say the same thing; for a hierarchical
    // one it is because they contradict, and the first is the one the user
    // is more likely to have seen and accepted.
    const pair = SYMMETRIC.has(e.type) || HIERARCHICAL.has(e.type)
      ? [e.sourceId, e.targetId].sort((a, b) => a - b).join('~')
      : `${e.sourceId}>${e.targetId}`
    const key = `${pair}:${e.type}`
    if (keep.has(key)) drop.push(e)
    else keep.add(key)
  }
  return drop
}

function isOpen(node: Node): boolean {
  const p = node.properties as Record<string, unknown>
  if (p.archived === true) return false
  if (node.type === 'Task' && p.status === 'done') return false
  if ((node.type === 'Goal' || node.type === 'Project') && p.status === 'completed') return false
  return true
}

export async function sweepGraph(userId: number, mode: LinkMode): Promise<SweepResult> {
  const ranAt = new Date().toISOString()
  const nodes = await getNodes(userId)
  let edges = await getEdges(userId)

  // ── tidy ──────────────────────────────────────────────────
  const drop = redundantEdges(edges)
  for (const e of drop) await deleteEdge(userId, e.id)
  if (drop.length > 0) {
    const dropped = new Set(drop.map((e) => e.id))
    edges = edges.filter((e) => !dropped.has(e.id))
  }

  // ── connect ───────────────────────────────────────────────
  const meaningful = new Set<number>()
  for (const e of edges) {
    if (STRUCTURAL_ONLY.has(e.type)) continue
    meaningful.add(e.sourceId)
    meaningful.add(e.targetId)
  }

  const loose = nodes
    .filter((n) => !BOOKKEEPING.has(n.type.toLowerCase()))
    .filter((n) => LINKABLE_SUBJECTS.has(n.type))
    .filter(isOpen)
    .filter((n) => !meaningful.has(n.id))
    .sort((a, b) => b.id - a.id)

  const batch = mode === 'off' ? [] : loose.slice(0, MAX_LINK_ATTEMPTS)

  let linked = 0
  let proposed = 0
  for (const node of batch) {
    try {
      // The pool is read once, before the loop, and reused: each attempt
      // would otherwise re-read the whole graph, twenty times over.
      //
      // The edge list, though, has to keep up. Passing the same snapshot to
      // every node meant each one was judged against the graph as it was
      // before the sweep started — so a lecture linked to its course, and
      // then the course, asked separately, linked itself back to the
      // lecture, neither able to see what the other had just written.
      const out = await linkNode(userId, node.id, mode, { candidates: nodes, edges })
      linked += out.linked
      if (out.created.length) edges = [...edges, ...out.created]
      if (out.proposed) proposed++
    } catch {
      // One node the model choked on should not end the sweep.
    }
  }

  return {
    ranAt,
    scanned: batch.length,
    linked,
    proposed,
    tidied: drop.length,
    remaining: Math.max(0, loose.length - batch.length),
  }
}
