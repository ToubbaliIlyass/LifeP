import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import type { Node, Edge } from '@/lib/db/schema'

export type NodeData = {
  dbNode: Node
  label: string
  properties: Record<string, unknown>
  circleR?: number
}

const TYPE_ORDER = ['Goal', 'Habit', 'Task', 'Event']
const NODE_WIDTH = 200
const NODE_HEIGHT = 80
const COL_GAP = 240
const ROW_GAP = 100

export function getLabel(node: Node): string {
  const props = node.properties as Record<string, unknown>
  if (typeof props.name === 'string') return props.name
  if (typeof props.title === 'string') return props.title
  return `${node.type} #${node.id}`
}

export function toFlowNodes(nodes: Node[]): FlowNode<NodeData>[] {
  const byType = new Map<string, Node[]>()
  for (const node of nodes) {
    const bucket = byType.get(node.type) ?? []
    bucket.push(node)
    byType.set(node.type, bucket)
  }

  // Ordered types first, then any extras alphabetically
  const types = [
    ...TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t)).sort(),
  ]

  const flowNodes: FlowNode<NodeData>[] = []
  types.forEach((type, colIdx) => {
    const group = byType.get(type) ?? []
    group.forEach((node, rowIdx) => {
      flowNodes.push({
        id: String(node.id),
        type: type.toLowerCase(),
        position: { x: colIdx * COL_GAP, y: rowIdx * ROW_GAP },
        data: {
          dbNode: node,
          label: getLabel(node),
          properties: node.properties as Record<string, unknown>,
          circleR: 23,
        },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })
    })
  })
  return flowNodes
}

export function toFlowEdges(edges: Edge[]): FlowEdge[] {
  return edges.map((edge) => ({
    id: String(edge.id),
    source: String(edge.sourceId),
    target: String(edge.targetId),
    label: edge.type,
    type: 'smoothstep',
    style: { strokeWidth: 1.5 },
    labelStyle: { fontSize: 10 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 3,
  }))
}

// ---------------------------------------------------------------------------
// Force-directed graph layout (Obsidian style)
// ---------------------------------------------------------------------------

interface D3Node extends SimulationNodeDatum {
  id: string
  radius: number
}

interface D3Link extends SimulationLinkDatum<D3Node> {
  distance: number
}

const STRUCT_EDGE = { stroke: 'oklch(0.55 0 0 / 25%)', strokeWidth: 1 }
const SEMANTIC_EDGE = { stroke: 'oklch(0.74 0.14 72 / 80%)', strokeWidth: 1.5 }

const LABEL_NODE_PREFIX = '__label__'

// Rough px-per-character estimate for the 10px edge-label font, plus the
// label's own rendered background box (labelBgPadding: [4, 2], see
// toFlowEdges/toFlowGraph below) and a further buffer so the *background
// container* — not just the text inside it — ends up with clear space
// around it, matching the extra LABEL_GAP margin applied everywhere else.
function estimateLabelRadius(text: string): number {
  return (text.length * 5.5) / 2 + 17
}

function pluralize(type: string): string {
  const lower = type.toLowerCase()
  if (lower === 'journalentry') return 'Journal'
  if (lower.endsWith('s')) return type
  if (lower.endsWith('y')) return type.slice(0, -1) + 'ies'
  return type + 's'
}

export function toFlowGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  // HabitLog and TimeBlock are bookkeeping nodes, not things the user thinks
  // of as part of their graph -- TimeBlock's schedule info surfaces instead
  // via the hover tooltip on whatever it's linked to (see GraphView).
  const HIDDEN_TYPES = new Set(['habitlog', 'timeblock', 'savedview'])
  const filteredNodes = nodes.filter((n) => !HIDDEN_TYPES.has(n.type.toLowerCase()))
  const filteredNodeIds = new Set(filteredNodes.map((n) => String(n.id)))

  const byType = new Map<string, Node[]>()
  for (const node of filteredNodes) {
    const bucket = byType.get(node.type) ?? []
    bucket.push(node)
    byType.set(node.type, bucket)
  }

  const types = [
    ...TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t)).sort(),
  ]

  // ── Build d3 simulation nodes ──────────────────────────
  const d3nodes: D3Node[] = []
  const d3links: D3Link[] = []

  // Root (fixed at center)
  d3nodes.push({ id: '__root__', radius: 44, fx: 0, fy: 0 })

  types.forEach((type) => {
    const catId = `__cat__:${type}`
    const catLabel = pluralize(type)
    d3nodes.push({ id: catId, radius: Math.max(31, estimateLabelRadius(catLabel)) })
    d3links.push({ source: '__root__', target: catId, distance: 150 })

    const group = byType.get(type) ?? []
    group.forEach((node) => {
      const nodeId = String(node.id)
      // Radius includes the node's own rendered label, not just its
      // circle, so the collision force below keeps neighbors (and edge
      // labels) clear of the text too, not just the dot.
      d3nodes.push({ id: nodeId, radius: Math.max(23, estimateLabelRadius(getLabel(node))) })
      d3links.push({ source: catId, target: nodeId, distance: 110 })
    })
  })

  // Semantic edges also influence the layout. Each also gets a small
  // "virtual" label node riding along it — with its own collision radius —
  // so the edge-type text has somewhere to land that isn't on top of a
  // node circle or another label, and stays clear as the graph grows.
  for (const edge of edges) {
    const src = String(edge.sourceId)
    const tgt = String(edge.targetId)
    if (!filteredNodeIds.has(src) || !filteredNodeIds.has(tgt)) continue
    d3links.push({ source: src, target: tgt, distance: 95 })

    const labelId = `${LABEL_NODE_PREFIX}${edge.id}`
    d3nodes.push({ id: labelId, radius: estimateLabelRadius(edge.type) })
    d3links.push({ source: src, target: labelId, distance: 48 })
    d3links.push({ source: labelId, target: tgt, distance: 48 })
  }

  // ── Run force simulation ───────────────────────────────
  const nodeById = new Map(d3nodes.map((n) => [n.id, n]))

  const sim = forceSimulation<D3Node>(d3nodes)
    .force(
      'link',
      forceLink<D3Node, D3Link>(d3links)
        .id((d) => d.id)
        .distance((d) => d.distance)
        .strength(0.7),
    )
    .force('charge', forceManyBody<D3Node>().strength(-360))
    .force('center', forceCenter(0, 0))
    // Extra padding accounts for the label text rendered below/around each
    // node — without it, labels from adjacent nodes overlap even though
    // the circles themselves don't touch. Label nodes collide too, so they
    // get pushed off node circles and off each other.
    .force('collide', forceCollide<D3Node>((d) => d.radius + 32))
    .stop()

  // Run synchronously for stable initial layout
  sim.tick(400)

  // ── Build React Flow nodes & edges ────────────────────
  const flowNodes: FlowNode[] = []
  const flowEdges: FlowEdge[] = []

  const pos = (id: string) => {
    const n = nodeById.get(id)
    return { x: n?.x ?? 0, y: n?.y ?? 0 }
  }

  // Text label attached to each node, kept alongside its render radius so
  // the collision pass below can build an accurate "keep clear" box for it.
  // Root and category labels are drawn *inside* their circle (see
  // RootNode/CategoryNode), so they get an empty `text` here — only leaf
  // nodes render a label below the circle that needs its own bbox.
  const labelInfo = new Map<string, { text: string; radius: number }>()

  // Root
  const rootPos = pos('__root__')
  labelInfo.set('__root__', { text: '', radius: 42 })
  flowNodes.push({
    id: '__root__',
    type: 'root',
    position: rootPos,
    origin: [0.5, 0.5],
    data: { label: 'Ilyass', circleR: 42 },
  })

  types.forEach((type) => {
    const catId = `__cat__:${type}`
    const catPos = pos(catId)
    const catLabel = pluralize(type)
    labelInfo.set(catId, { text: '', radius: 32 })

    flowNodes.push({
      id: catId,
      type: 'category',
      position: catPos,
      origin: [0.5, 0.5],
      data: { label: catLabel, nodeType: type.toLowerCase(), circleR: 32 },
    })

    flowEdges.push({
      id: `__e__root__${type}`,
      source: '__root__',
      target: catId,
      type: 'floating',
      style: STRUCT_EDGE,
    })

    const group = byType.get(type) ?? []
    group.forEach((node) => {
      const nodeId = String(node.id)
      const leafPos = pos(nodeId)
      const leafLabel = getLabel(node)
      labelInfo.set(nodeId, { text: leafLabel, radius: 23 })

      flowNodes.push({
        id: nodeId,
        type: node.type.toLowerCase(),
        position: leafPos,
        origin: [0.5, 0.5],
        data: {
          dbNode: node,
          label: leafLabel,
          properties: node.properties as Record<string, unknown>,
          circleR: 23,
        },
      })

      flowEdges.push({
        id: `__e__${catId}__${nodeId}`,
        source: catId,
        target: nodeId,
        type: 'floating',
        style: STRUCT_EDGE,
      })
    })
  })

  // Push flowEdges for the semantic DB edges (labels placed below, via the
  // same declutter pass used after a manual drag).
  for (const edge of edges) {
    const src = String(edge.sourceId)
    const tgt = String(edge.targetId)
    if (!filteredNodeIds.has(src) || !filteredNodeIds.has(tgt)) continue
    flowEdges.push({
      id: String(edge.id),
      source: src,
      target: tgt,
      label: edge.type,
      type: 'floating',
      style: SEMANTIC_EDGE,
      markerEnd: { type: 'arrowclosed' as const, color: 'oklch(0.74 0.14 72)' },
      labelStyle: { fontSize: 10 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    })
  }

  // Resolve leftover circle/label overlap with the exact same relaxation
  // used after a manual drag (see `declutter` below), so a first-load
  // layout that the force simulation didn't fully untangle gets the same
  // correction a drag would trigger.
  const declutterNodes: DeclutterNode[] = flowNodes.map((n) => {
    const info = labelInfo.get(n.id)
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      radius: info?.radius ?? 23,
      label: info?.text ?? '',
      fixed: n.id === '__root__',
    }
  })
  const declutterEdges: DeclutterEdge[] = flowEdges
    .filter((e) => typeof e.label === 'string')
    .map((e) => ({ id: e.id, source: String(e.source), target: String(e.target), label: e.label as string }))

  const { positions, labelOffsets } = declutter(declutterNodes, declutterEdges)

  for (const n of flowNodes) {
    const p = positions.get(n.id)
    if (p) n.position = p
  }
  for (const e of flowEdges) {
    if (typeof e.label !== 'string') continue
    e.data = { labelOffset: labelOffsets.get(e.id) ?? { dx: 0, dy: 0 } }
  }

  return { nodes: flowNodes, edges: flowEdges }
}

// ---------------------------------------------------------------------------
// Compact re-layout — re-runs force simulation with tight parameters to
// produce an organic, uniform blob like the reference image
// ---------------------------------------------------------------------------

export function computeRadialLayout(currentNodes: FlowNode[]): FlowNode[] {
  const root       = currentNodes.find((n) => n.id === '__root__')
  const categories = currentNodes.filter((n) => n.id.startsWith('__cat__:'))
  const leaves     = currentNodes.filter((n) => n.id !== '__root__' && !n.id.startsWith('__cat__:'))

  if (!root) return currentNodes

  // Build d3 simulation nodes and links mirroring the graph structure
  const d3nodes: D3Node[] = [{ id: '__root__', radius: 44, fx: 0, fy: 0 }]
  const d3links: D3Link[] = []

  for (const cat of categories) {
    d3nodes.push({ id: cat.id, radius: 31 })
    d3links.push({ source: '__root__', target: cat.id, distance: 110 })

    const typeKey = cat.id.replace('__cat__:', '').toLowerCase()
    for (const leaf of leaves.filter((n) => n.type === typeKey)) {
      d3nodes.push({ id: leaf.id, radius: 23 })
      d3links.push({ source: cat.id, target: leaf.id, distance: 85 })
    }
  }

  const nodeById = new Map(d3nodes.map((n) => [n.id, n]))

  forceSimulation<D3Node>(d3nodes)
    .force(
      'link',
      forceLink<D3Node, D3Link>(d3links)
        .id((d) => d.id)
        .distance((d) => d.distance)
        .strength(1.1),
    )
    .force('charge', forceManyBody<D3Node>().strength(-140))
    .force('center', forceCenter(0, 0))
    // Match the main layout's padding so labels don't collide after a re-layout.
    .force('collide', forceCollide<D3Node>((d) => d.radius + 40))
    .stop()
    .tick(500)

  return currentNodes.map((n) => {
    const d = nodeById.get(n.id)
    if (!d) return n
    return { ...n, position: { x: d.x ?? 0, y: d.y ?? 0 } }
  })
}

// ---------------------------------------------------------------------------
// Live declutter — run after the user drags a node, so any circle/label
// overlap the move created gets resolved on the spot, rather than only at
// the next full re-layout.
// ---------------------------------------------------------------------------

interface BBox { x1: number; y1: number; x2: number; y2: number }
const bboxOverlap = (a: BBox, b: BBox) =>
  a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1

export interface DeclutterNode {
  id: string
  x: number
  y: number
  radius: number
  label: string
  fixed?: boolean
}

export interface DeclutterEdge {
  id: string
  source: string
  target: string
  label?: string
}

// Both circles and labels need a visible gap from their neighbors, not just
// "not touching" — added on top of the raw box only for the overlap
// *check*, so two things count as colliding a bit before their edges
// actually meet. Same logic, same margin, applied uniformly to every kind
// of box: node circles, node labels, and edge labels alike.
const CIRCLE_GAP = 10
const LABEL_GAP = 16

function inflate(b: BBox, m: number): BBox {
  return { x1: b.x1 - m, y1: b.y1 - m, x2: b.x2 + m, y2: b.y2 + m }
}

function nodeCircleBBox(n: DeclutterNode): BBox {
  const r = n.radius + CIRCLE_GAP
  return { x1: n.x - r, y1: n.y - r, x2: n.x + r, y2: n.y + r }
}

// Leaf node labels (TaskNode, HabitNode, etc.) all render the same way:
// a fixed-width block wrapping to at most 2 lines, `mt-1.5` below the
// circle. Root/category labels live inside their circle instead (empty
// `label` here — see labelInfo above), so they get a zero-size box.
const LEAF_LABEL_WIDTH = 104
const LEAF_LABEL_LINE_HEIGHT = 13
const LEAF_LABEL_MAX_LINES = 2
const LEAF_LABEL_TOP_GAP = 6

function nodeLabelBBox(n: DeclutterNode): BBox {
  if (!n.label) return { x1: n.x, y1: n.y, x2: n.x, y2: n.y }
  const y1 = n.y + n.radius + LEAF_LABEL_TOP_GAP
  const y2 = y1 + LEAF_LABEL_LINE_HEIGHT * LEAF_LABEL_MAX_LINES
  return inflate({ x1: n.x - LEAF_LABEL_WIDTH / 2, y1, x2: n.x + LEAF_LABEL_WIDTH / 2, y2 }, LABEL_GAP)
}

// Half-height of an edge label's rendered background box (~9px text +
// labelBgPadding), shared by the minimum-distance check below and the
// placement search further down.
const EDGE_LABEL_HALF_HEIGHT = 11

// How far apart two connected nodes need to be, center to center, for
// everything that has to fit *along that line* — each node's own circle,
// its label block (if it renders one), and the edge-type pill between
// them — to have room without overlapping. Computed from the same size
// constants the bboxes above use, instead of a guessed flat distance, so
// it scales automatically if a node happens to have no external label
// (root/category) or the label metrics change.
function minLabeledEdgeDistance(a: DeclutterNode, b: DeclutterNode): number {
  const labelSpan = (n: DeclutterNode) =>
    n.label ? LEAF_LABEL_TOP_GAP + LEAF_LABEL_LINE_HEIGHT * LEAF_LABEL_MAX_LINES + LABEL_GAP : 0
  const edgeLabelSpan = 2 * (EDGE_LABEL_HALF_HEIGHT + LABEL_GAP)
  return (a.radius + CIRCLE_GAP) + labelSpan(a) + edgeLabelSpan + labelSpan(b) + (b.radius + CIRCLE_GAP)
}

/**
 * Resolves overlaps that a manual drag introduced: a short relaxation pass
 * separates any two nodes whose circle or label now collide, then edge
 * labels are re-placed (same shift/slide search as the initial layout)
 * against the settled positions. Returns the full target state — the
 * caller decides how to animate from current positions to these.
 */
export function declutter(
  nodesIn: DeclutterNode[],
  edgesIn: DeclutterEdge[],
): { positions: Map<string, { x: number; y: number }>; labelOffsets: Map<string, { dx: number; dy: number }> } {
  const nodes = nodesIn.map((n) => ({ ...n }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const labeledEdges = edgesIn.filter((e) => e.label)

  function pushApart(a: DeclutterNode, b: DeclutterNode, amount: number) {
    if (amount <= 0) return
    const dx = b.x - a.x, dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // Nodes dropped exactly on top of each other have no direction to
    // push apart along — fall back to straight down, matching the
    // tree layout's default stacking axis.
    const [ux, uy] = dist > 1e-6 ? [dx / dist, dy / dist] : [0, 1]
    // When one side of the pair is fixed (root, or the node the user is
    // actively dragging), the other side must cover the full amount
    // itself — otherwise separation stalls halfway no matter how many
    // iterations run.
    const freeCount = (a.fixed ? 0 : 1) + (b.fixed ? 0 : 1)
    if (freeCount === 0) return
    const share = amount / freeCount
    if (!a.fixed) { a.x -= ux * share; a.y -= uy * share }
    if (!b.fixed) { b.x += ux * share; b.y += uy * share }
  }

  for (let iter = 0; iter < 24; iter++) {
    let moved = false
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        if (a.fixed && b.fixed) continue
        const boxesA = [nodeCircleBBox(a), nodeLabelBBox(a)]
        const boxesB = [nodeCircleBBox(b), nodeLabelBBox(b)]
        const hit = boxesA.some((ba) => boxesB.some((bb) => bboxOverlap(ba, bb)))
        if (!hit) continue

        moved = true
        pushApart(a, b, 6)
      }
    }

    // Box overlap alone doesn't know an edge label has to fit *between*
    // its two nodes — two connected leaves can each have plenty of
    // clearance for their own circle+label and still leave no room for
    // the edge-type pill riding the line between them. Enforce that
    // minimum span here so the pill never has to fall back onto either
    // node just for lack of space.
    for (const e of labeledEdges) {
      const a = byId.get(e.source)
      const b = byId.get(e.target)
      if (!a || !b || (a.fixed && b.fixed)) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const deficit = minLabeledEdgeDistance(a, b) - dist
      if (deficit <= 0.5) continue
      moved = true
      pushApart(a, b, deficit)
    }

    if (!moved) break
  }

  const positions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))

  const obstacles: BBox[] = []
  for (const n of nodes) { obstacles.push(nodeCircleBBox(n)); obstacles.push(nodeLabelBBox(n)) }

  const labelOffsets = new Map<string, { dx: number; dy: number }>()
  const SHIFTS = [0, 12, 20, 28, 36]

  for (const e of edgesIn) {
    if (!e.label) continue
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) continue

    const labelHalfW = estimateLabelRadius(e.label)
    const labelHalfH = EDGE_LABEL_HALF_HEIGHT
    const bboxAt = (cx: number, cy: number): BBox =>
      inflate({ x1: cx - labelHalfW, y1: cy - labelHalfH, x2: cx + labelHalfW, y2: cy + labelHalfH }, LABEL_GAP)
    const clearOf = (bb: BBox) => !obstacles.some((o) => bboxOverlap(bb, o))

    const dx = tgt.x - src.x, dy = tgt.y - src.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const ux = dx / len, uy = dy / len
    const px = -uy, py = ux

    let chosen: { x: number; y: number } | null = null
    let fallback = { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 }

    outer:
    for (const t of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      const bx = src.x + dx * t, by = src.y + dy * t
      for (const s of SHIFTS) {
        for (const sign of s === 0 ? [1] : [1, -1]) {
          const cx = bx + px * s * sign, cy = by + py * s * sign
          if (t === 0.5 && s === 0) fallback = { x: cx, y: cy }
          if (clearOf(bboxAt(cx, cy))) { chosen = { x: cx, y: cy }; break outer }
        }
      }
    }

    const final = chosen ?? fallback
    obstacles.push(bboxAt(final.x, final.y))
    const midX = (src.x + tgt.x) / 2, midY = (src.y + tgt.y) / 2
    labelOffsets.set(e.id, { dx: final.x - midX, dy: final.y - midY })
  }

  return { positions, labelOffsets }
}
