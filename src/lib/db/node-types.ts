import { eq, and } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { nodeTypes } from '@/lib/db/schema'
import type { NodeType } from '@/lib/db/schema'

export async function getNodeTypes(userId: number): Promise<NodeType[]> {
  return getDb().select().from(nodeTypes).where(eq(nodeTypes.userId, userId)).all()
}

export async function getSchemaVersion(userId: number): Promise<number> {
  return (await getNodeTypes(userId)).length
}

export async function createNodeType(
  userId: number,
  name: string,
  typeSchema: Record<string, unknown>,
): Promise<NodeType> {
  return getDb()
    .insert(nodeTypes)
    .values({ userId, name, schema: typeSchema, isBuiltin: false })
    .returning()
    .get()
}

export async function nodeTypeExists(userId: number, name: string): Promise<boolean> {
  const row = await getDb()
    .select({ id: nodeTypes.id })
    .from(nodeTypes)
    .where(and(eq(nodeTypes.userId, userId), eq(nodeTypes.name, name)))
    .get()
  return !!row
}

/** Takes back a type a proposal registered. Never a built-in one. */
export async function deleteNodeType(userId: number, name: string): Promise<void> {
  await getDb().delete(nodeTypes).where(and(eq(nodeTypes.userId, userId), eq(nodeTypes.name, name), eq(nodeTypes.isBuiltin, false))).run()
}
