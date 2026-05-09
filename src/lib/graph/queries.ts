import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { edges, nodes } from '@/lib/db/schema'
import type { Edge, NewEdge, NewNode, Node } from '@/lib/db/schema'

export interface NodeFilter {
  type?: string
}

export interface EdgeFilter {
  sourceId?: number
  targetId?: number
  type?: string
}

export function getNodes(userId: number, filter?: NodeFilter): Node[] {
  const conditions = [eq(nodes.userId, userId)]
  if (filter?.type) conditions.push(eq(nodes.type, filter.type))
  return db.select().from(nodes).where(and(...conditions)).all()
}

export function getEdges(userId: number, filter?: EdgeFilter): Edge[] {
  const conditions = [eq(edges.userId, userId)]
  if (filter?.sourceId) conditions.push(eq(edges.sourceId, filter.sourceId))
  if (filter?.targetId) conditions.push(eq(edges.targetId, filter.targetId))
  if (filter?.type) conditions.push(eq(edges.type, filter.type))
  return db.select().from(edges).where(and(...conditions)).all()
}

export interface NodeWithNeighbors {
  node: Node
  neighbors: Array<{ node: Node; edge: Edge; direction: 'outgoing' | 'incoming' }>
}

export function getNodeWithNeighbors(userId: number, nodeId: number): NodeWithNeighbors | null {
  const node = db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .get()

  if (!node) return null

  const connectedEdges = db
    .select()
    .from(edges)
    .where(
      and(
        eq(edges.userId, userId),
        or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId)),
      ),
    )
    .all()

  const neighbors: NodeWithNeighbors['neighbors'] = []
  for (const edge of connectedEdges) {
    const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId
    const direction = edge.sourceId === nodeId ? 'outgoing' : 'incoming'
    const neighborNode = db
      .select()
      .from(nodes)
      .where(and(eq(nodes.id, neighborId), eq(nodes.userId, userId)))
      .get()
    if (neighborNode) neighbors.push({ node: neighborNode, edge, direction })
  }

  return { node, neighbors }
}

export function createNode(userId: number, type: string, properties: Record<string, unknown>): Node {
  const result = db
    .insert(nodes)
    .values({ userId, type, properties } satisfies NewNode)
    .returning()
    .get()
  return result
}

export function createEdge(
  userId: number,
  sourceId: number,
  targetId: number,
  type: string,
  properties: Record<string, unknown> = {},
): Edge {
  return db
    .insert(edges)
    .values({ userId, sourceId, targetId, type, properties } satisfies NewEdge)
    .returning()
    .get()
}

export function updateNode(
  userId: number,
  nodeId: number,
  properties: Record<string, unknown>,
): Node | undefined {
  return db
    .update(nodes)
    .set({ properties, updatedAt: new Date().toISOString() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .returning()
    .get()
}

export function deleteNode(userId: number, nodeId: number): void {
  // Foreign key cascade removes connected edges when the node is deleted.
  db.delete(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId))).run()
}
