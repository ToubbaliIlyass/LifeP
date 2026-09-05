import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeTypes } from '@/lib/db/schema'
import type { NodeType } from '@/lib/db/schema'

export async function getNodeTypes(userId: number): Promise<NodeType[]> {
  return db.select().from(nodeTypes).where(eq(nodeTypes.userId, userId)).all()
}

export async function getSchemaVersion(userId: number): Promise<number> {
  return (await getNodeTypes(userId)).length
}

export async function createNodeType(
  userId: number,
  name: string,
  typeSchema: Record<string, unknown>,
): Promise<NodeType> {
  return db
    .insert(nodeTypes)
    .values({ userId, name, schema: typeSchema, isBuiltin: false })
    .returning()
    .get()
}

export async function nodeTypeExists(userId: number, name: string): Promise<boolean> {
  const row = await db
    .select({ id: nodeTypes.id })
    .from(nodeTypes)
    .where(and(eq(nodeTypes.userId, userId), eq(nodeTypes.name, name)))
    .get()
  return !!row
}
