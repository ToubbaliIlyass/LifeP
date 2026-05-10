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

function getLabel(node: Node): string {
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
