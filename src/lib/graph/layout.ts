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
          circleR: 19,
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
    labelStyle: { fontSize: 9 },
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
  const filteredNodes = nodes.filter((n) => n.type.toLowerCase() !== 'habitlog')
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
  d3nodes.push({ id: '__root__', radius: 38, fx: 0, fy: 0 })

  types.forEach((type) => {
    const catId = `__cat__:${type}`
    d3nodes.push({ id: catId, radius: 26 })
    d3links.push({ source: '__root__', target: catId, distance: 140 })

    const group = byType.get(type) ?? []
    group.forEach((node) => {
      const nodeId = String(node.id)
      d3nodes.push({ id: nodeId, radius: 18 })
      d3links.push({ source: catId, target: nodeId, distance: 100 })
    })
  })

  // Semantic edges also influence the layout
  for (const edge of edges) {
    const src = String(edge.sourceId)
    const tgt = String(edge.targetId)
    if (filteredNodeIds.has(src) && filteredNodeIds.has(tgt)) {
      d3links.push({ source: src, target: tgt, distance: 80 })
    }
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
    .force('charge', forceManyBody<D3Node>().strength(-320))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<D3Node>((d) => d.radius + 22))
    .stop()

  // Run synchronously for stable initial layout
  sim.tick(350)

  // ── Build React Flow nodes & edges ────────────────────
  const flowNodes: FlowNode[] = []
  const flowEdges: FlowEdge[] = []

  const pos = (id: string) => {
    const n = nodeById.get(id)
    return { x: n?.x ?? 0, y: n?.y ?? 0 }
  }

  // Root
  const rootPos = pos('__root__')
  flowNodes.push({
    id: '__root__',
    type: 'root',
    position: rootPos,
    origin: [0.5, 0.5],
    data: { label: 'Ilyass', circleR: 36 },
  })

  types.forEach((type) => {
    const catId = `__cat__:${type}`
    const catPos = pos(catId)

    flowNodes.push({
      id: catId,
      type: 'category',
      position: catPos,
      origin: [0.5, 0.5],
      data: { label: pluralize(type), nodeType: type.toLowerCase(), circleR: 27 },
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

      flowNodes.push({
        id: nodeId,
        type: node.type.toLowerCase(),
        position: leafPos,
        origin: [0.5, 0.5],
        data: {
          dbNode: node,
          label: getLabel(node),
          properties: node.properties as Record<string, unknown>,
          circleR: 19,
        },
      })

      flowEdges.push({
        id: `__e__${catId}__${nodeId}`,
        source: catId,
        target: nodeId,
        type: 'default',
        style: STRUCT_EDGE,
      })
    })
  })

  // Semantic DB edges
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
      labelStyle: { fontSize: 9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    })
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
  const d3nodes: D3Node[] = [{ id: '__root__', radius: 38, fx: 0, fy: 0 }]
  const d3links: D3Link[] = []

  for (const cat of categories) {
    d3nodes.push({ id: cat.id, radius: 26 })
    d3links.push({ source: '__root__', target: cat.id, distance: 90 })

    const typeKey = cat.id.replace('__cat__:', '').toLowerCase()
    for (const leaf of leaves.filter((n) => n.type === typeKey)) {
      d3nodes.push({ id: leaf.id, radius: 18 })
      d3links.push({ source: cat.id, target: leaf.id, distance: 65 })
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
    .force('charge', forceManyBody<D3Node>().strength(-90))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<D3Node>((d) => d.radius + 10))
    .stop()
    .tick(500)

  return currentNodes.map((n) => {
    const d = nodeById.get(n.id)
    if (!d) return n
    return { ...n, position: { x: d.x ?? 0, y: d.y ?? 0 } }
  })
}
