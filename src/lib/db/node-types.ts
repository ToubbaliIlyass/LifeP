import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeTypes } from '@/lib/db/schema'
import type { NodeType } from '@/lib/db/schema'

export function getNodeTypes(userId: number): NodeType[] {
  return db.select().from(nodeTypes).where(eq(nodeTypes.userId, userId)).all()
}

export function getSchemaVersion(userId: number): number {
  return getNodeTypes(userId).length
}

export function createNodeType(
  userId: number,
  name: string,
  typeSchema: Record<string, unknown>,
): NodeType {
  return db
    .insert(nodeTypes)
    .values({ userId, name, schema: typeSchema, isBuiltin: false })
    .returning()
    .get()
}

export function nodeTypeExists(userId: number, name: string): boolean {
  return !!db
    .select({ id: nodeTypes.id })
    .from(nodeTypes)
    .where(and(eq(nodeTypes.userId, userId), eq(nodeTypes.name, name)))
    .get()
}
