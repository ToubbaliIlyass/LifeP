import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { proposals } from '@/lib/db/schema'
import type { NewProposal, Proposal } from '@/lib/db/schema'
import type { BatchOperation } from '@/lib/ai/tools'

export async function createProposal(
  userId: number,
  summary: string,
  operations: BatchOperation[],
  schemaVersion = 0,
): Promise<Proposal> {
  return db
    .insert(proposals)
    .values({
      userId,
      summary,
      operations,
      schemaVersion,
    } satisfies NewProposal)
    .returning()
    .get()
}

export async function getPendingProposals(userId: number): Promise<Proposal[]> {
  return db
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, userId), eq(proposals.status, 'pending')))
    .orderBy(desc(proposals.createdAt))
    .all()
}

export async function getRecentRejections(userId: number, limit = 5): Promise<Proposal[]> {
  return db
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, userId), eq(proposals.status, 'rejected')))
    .orderBy(desc(proposals.resolvedAt))
    .limit(limit)
    .all()
}

export async function approveProposal(
  id: number,
  userId: number,
  executionResult?: unknown,
): Promise<Proposal | undefined> {
  return db
    .update(proposals)
    .set({
      status: 'approved',
      resolvedAt: new Date().toISOString(),
      executionResult: executionResult ?? null,
    })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
    .returning()
    .get()
}

export async function getProposalById(id: number, userId: number): Promise<Proposal | undefined> {
  return db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
    .get()
}

export async function rejectProposal(
  id: number,
  userId: number,
  reason: string,
): Promise<Proposal | undefined> {
  return db
    .update(proposals)
    .set({ status: 'rejected', rejectionReason: reason, resolvedAt: new Date().toISOString() })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
    .returning()
    .get()
}
