import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react'
import type { Node, Edge } from '@/lib/db/schema'

export type NodeData = {
  dbNode: Node
  label: string
  properties: Record<string, unknown>
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
// Radial tree layout
// ---------------------------------------------------------------------------

const CAT_RADIUS = 280
const DIM_STYLE = { stroke: 'oklch(0.5 0 0 / 30%)', strokeWidth: 1 }
const LEAF_CARD_W = 180
const LEAF_CARD_H = 80

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
  // Filter out HabitLog nodes
  const filteredNodes = nodes.filter((n) => n.type.toLowerCase() !== 'habitlog')
  const filteredNodeIds = new Set(filteredNodes.map((n) => String(n.id)))

  // Group by type
  const byType = new Map<string, Node[]>()
  for (const node of filteredNodes) {
    const bucket = byType.get(node.type) ?? []
    bucket.push(node)
    byType.set(node.type, bucket)
  }

  // Build ordered type list: pinned first, then alphabetical
  const types = [
    ...TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t)).sort(),
  ]

  const maxLeafCount = Math.max(1, ...types.map((t) => (byType.get(t) ?? []).length))
  const leafRadius = Math.max(560, maxLeafCount * 60)

  const flowNodes: FlowNode[] = []
  const flowEdges: FlowEdge[] = []

  // Root node
  flowNodes.push({
    id: '__root__',
    type: 'root',
    position: { x: 0, y: 0 },
    data: { label: 'Ilyass' },
  })

  types.forEach((type, i) => {
    const catAngle = (i / types.length) * 2 * Math.PI - Math.PI / 2
    const catX = Math.cos(catAngle) * CAT_RADIUS
    const catY = Math.sin(catAngle) * CAT_RADIUS
    const catId = `__cat__:${type}`

    // Category node
    flowNodes.push({
      id: catId,
      type: 'category',
      position: { x: catX, y: catY },
      data: { label: pluralize(type), nodeType: type.toLowerCase() },
    })

    // Root → category edge
    flowEdges.push({
      id: `__edge__root__${catId}`,
      source: '__root__',
      target: catId,
      type: 'straight',
      style: DIM_STYLE,
    })

    const group = byType.get(type) ?? []
    const spread = Math.min(Math.PI * 0.75, ((2 * Math.PI) / types.length) * 0.7)

    group.forEach((node, j) => {
      let leafAngle: number
      if (group.length === 1) {
        leafAngle = catAngle
      } else {
        const half = spread / 2
        leafAngle = catAngle - half + (j / (group.length - 1)) * spread
      }

      const leafX = Math.cos(leafAngle) * leafRadius
      const leafY = Math.sin(leafAngle) * leafRadius
      const nodeId = String(node.id)

      flowNodes.push({
        id: nodeId,
        type: node.type.toLowerCase(),
        position: {
          x: leafX - LEAF_CARD_W / 2,
          y: leafY - LEAF_CARD_H / 2,
        },
        data: {
          dbNode: node,
          label: getLabel(node),
          properties: node.properties as Record<string, unknown>,
        },
      })

      // Category → leaf edge
      flowEdges.push({
        id: `__edge__${catId}__${nodeId}`,
        source: catId,
        target: nodeId,
        type: 'straight',
        style: DIM_STYLE,
      })
    })
  })

  // Semantic DB edges (leaf → leaf)
  for (const edge of edges) {
    const src = String(edge.sourceId)
    const tgt = String(edge.targetId)
    if (!filteredNodeIds.has(src) || !filteredNodeIds.has(tgt)) continue
    flowEdges.push({
      id: String(edge.id),
      source: src,
      target: tgt,
      label: edge.type,
      type: 'straight',
      style: { stroke: 'oklch(0.74 0.14 72)', strokeWidth: 1.5 },
      markerEnd: { type: 'arrowclosed' as const, color: 'oklch(0.74 0.14 72)' },
      labelStyle: { fontSize: 9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    })
  }

  return { nodes: flowNodes, edges: flowEdges }
}
