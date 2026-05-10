import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge } from '@/lib/graph/queries'
import { createNodeType, nodeTypeExists } from '@/lib/db/node-types'
import type { Node, Edge, NodeType } from '@/lib/db/schema'

interface ImportPayload {
  version: number
  nodes: Node[]
  edges: Edge[]
  nodeTypes: NodeType[]
}

export async function POST(request: Request) {
  const user = getCurrentUser()

  let payload: ImportPayload
  try {
    payload = await request.json() as ImportPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.version || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
    return Response.json({ error: 'Invalid export format' }, { status: 400 })
  }

  const nodeIdMap = new Map<number, number>() // old ID → new ID
  let importedNodes = 0
  let importedEdges = 0
  let importedTypes = 0

  // Import custom node types first
  for (const nt of payload.nodeTypes ?? []) {
    if (!nt.isBuiltin && !nodeTypeExists(user.id, nt.name)) {
      createNodeType(user.id, nt.name, nt.schema as Record<string, unknown>)
      importedTypes++
    }
  }

  // Import nodes, mapping old IDs to new IDs
  for (const node of payload.nodes) {
    const created = createNode(user.id, node.type, node.properties as Record<string, unknown>)
    nodeIdMap.set(node.id, created.id)
    importedNodes++
  }

  // Import edges, remapping source/target IDs
  for (const edge of payload.edges) {
    const newSource = nodeIdMap.get(edge.sourceId)
    const newTarget = nodeIdMap.get(edge.targetId)
    if (newSource && newTarget) {
      createEdge(user.id, newSource, newTarget, edge.type, edge.properties as Record<string, unknown>)
      importedEdges++
    }
  }

  return Response.json({ ok: true, importedNodes, importedEdges, importedTypes })
}
