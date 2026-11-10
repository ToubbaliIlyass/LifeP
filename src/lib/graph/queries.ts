import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
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
  return getDb().select().from(nodes).where(and(...conditions)).all()
}

export async function getEdges(userId: number, filter?: EdgeFilter): Promise<Edge[]> {
  const conditions = [eq(edges.userId, userId)]
  if (filter?.sourceId) conditions.push(eq(edges.sourceId, filter.sourceId))
  if (filter?.targetId) conditions.push(eq(edges.targetId, filter.targetId))
  if (filter?.type) conditions.push(eq(edges.type, filter.type))
  return getDb().select().from(edges).where(and(...conditions)).all()
}

export async function createNode(
  userId: number,
  type: string,
  properties: Record<string, unknown>,
): Promise<Node> {
  return getDb()
    .insert(nodes)
    .values({ userId, type, properties } satisfies NewNode)
    .returning()
    .get()
}

/**
 * Puts a deleted node back under the id it had, when that id is free, so
 * everything that pointed at it by id (an identity's lists, a
 * repeat's series) points at it again. A new id only if the old one has been taken.
 */
export async function restoreNode(
  userId: number,
  id: number,
  type: string,
  properties: Record<string, unknown>,
): Promise<Node> {
  const taken = await getDb().select({ id: nodes.id }).from(nodes).where(eq(nodes.id, id)).get()
  if (taken) return createNode(userId, type, properties)
  return getDb().insert(nodes).values({ id, userId, type, properties } satisfies NewNode).returning().get()
}

export async function createEdge(
  userId: number,
  sourceId: number,
  targetId: number,
  type: string,
  properties: Record<string, unknown> = {},
): Promise<Edge> {
  return getDb()
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
  return getDb()
    .update(nodes)
    .set({ properties, updatedAt: new Date().toISOString() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .returning()
    .get()
}

/**
 * Changes what a node is, keeping its id, properties and every edge.
 *
 * Only for types that share a shape — a Task becoming a Milestone keeps its
 * name, status and due date and simply stops being scheduled as work.
 */
export async function setNodeType(userId: number, nodeId: number, type: string): Promise<Node | undefined> {
  return getDb()
    .update(nodes)
    .set({ type, updatedAt: new Date().toISOString() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .returning()
    .get()
}

export async function deleteNode(userId: number, nodeId: number): Promise<void> {
  // Foreign key cascade removes connected edges when the node is deleted.
  await getDb().delete(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId))).run()
}

export async function deleteEdge(userId: number, edgeId: number): Promise<void> {
  await getDb().delete(edges).where(and(eq(edges.id, edgeId), eq(edges.userId, userId))).run()
}

export async function getNodeById(userId: number, nodeId: number): Promise<Node | undefined> {
  return getDb()
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .get()
}

export async function searchNodes(userId: number, query: string, types?: string[]): Promise<Node[]> {
  const lower = query.toLowerCase()
  const all = await getDb().select().from(nodes).where(eq(nodes.userId, userId)).all()
  return all
    .filter((n) => (!types || types.length === 0 || types.includes(n.type)))
    .filter((n) => JSON.stringify(n.properties).toLowerCase().includes(lower))
}
