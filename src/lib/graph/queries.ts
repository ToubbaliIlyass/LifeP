import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { edges, nodes } from '@/lib/db/schema'
import type { Edge, NewEdge, NewNode, Node } from '@/lib/db/schema'

/*
 * Every function here is async. That is not a style choice: libSQL talks to
 * the database over a network (or a local file through the same async API),
 * so the synchronous .get()/.all()/.run() that better-sqlite3 allowed are
 * gone. Callers must await.
 */

export interface NodeFilter {
  type?: string
}

export interface EdgeFilter {
  sourceId?: number
  targetId?: number
  type?: string
}

export async function getNodes(userId: number, filter?: NodeFilter): Promise<Node[]> {
  const conditions = [eq(nodes.userId, userId)]
  if (filter?.type) conditions.push(eq(nodes.type, filter.type))
  return db.select().from(nodes).where(and(...conditions)).all()
}

export async function getEdges(userId: number, filter?: EdgeFilter): Promise<Edge[]> {
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

export async function getNodeWithNeighbors(
  userId: number,
  nodeId: number,
): Promise<NodeWithNeighbors | null> {
  const node = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .get()

  if (!node) return null

  const connectedEdges = await db
    .select()
    .from(edges)
    .where(
      and(
        eq(edges.userId, userId),
        or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId)),
      ),
    )
    .all()

  // One query for every neighbour at once, rather than one query per edge —
  // the per-edge version was tolerable against a local file and is not
  // against a network round trip.
  const neighborIds = [...new Set(connectedEdges.map((e) => (e.sourceId === nodeId ? e.targetId : e.sourceId)))]
  const neighborNodes = neighborIds.length
    ? await db.select().from(nodes).where(eq(nodes.userId, userId)).all()
    : []
  const byId = new Map(neighborNodes.map((n) => [n.id, n]))

  const neighbors: NodeWithNeighbors['neighbors'] = []
  for (const edge of connectedEdges) {
    const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId
    const direction = edge.sourceId === nodeId ? 'outgoing' : 'incoming'
    const neighborNode = byId.get(neighborId)
    if (neighborNode) neighbors.push({ node: neighborNode, edge, direction })
  }

  return { node, neighbors }
}

export async function createNode(
  userId: number,
  type: string,
  properties: Record<string, unknown>,
): Promise<Node> {
  return db
    .insert(nodes)
    .values({ userId, type, properties } satisfies NewNode)
    .returning()
    .get()
}

export async function createEdge(
  userId: number,
  sourceId: number,
  targetId: number,
  type: string,
  properties: Record<string, unknown> = {},
): Promise<Edge> {
  return db
    .insert(edges)
    .values({ userId, sourceId, targetId, type, properties } satisfies NewEdge)
    .returning()
    .get()
}

/**
 * An identical source→target→type edge already in the graph, if any.
 *
 * The AI re-proposes relationships it can already see in the graph snapshot,
 * which silently accumulated duplicate parallel edges. Callers that write on
 * the model's behalf dedupe through this.
 */
export async function findExistingEdge(
  userId: number,
  sourceId: number,
  targetId: number,
  type: string,
): Promise<Edge | undefined> {
  return (await getEdges(userId, { sourceId, targetId, type }))[0]
}

export async function updateNode(
  userId: number,
  nodeId: number,
  properties: Record<string, unknown>,
): Promise<Node | undefined> {
  return db
    .update(nodes)
    .set({ properties, updatedAt: new Date().toISOString() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .returning()
    .get()
}

export async function deleteNode(userId: number, nodeId: number): Promise<void> {
  // Foreign key cascade removes connected edges when the node is deleted.
  await db.delete(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId))).run()
}

export async function deleteEdge(userId: number, edgeId: number): Promise<void> {
  await db.delete(edges).where(and(eq(edges.id, edgeId), eq(edges.userId, userId))).run()
}

export async function getNodeById(userId: number, nodeId: number): Promise<Node | undefined> {
  return db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .get()
}

export async function searchNodes(userId: number, query: string, types?: string[]): Promise<Node[]> {
  const lower = query.toLowerCase()
  const all = await db.select().from(nodes).where(eq(nodes.userId, userId)).all()
  return all
    .filter((n) => (!types || types.length === 0 || types.includes(n.type)))
    .filter((n) => JSON.stringify(n.properties).toLowerCase().includes(lower))
}
