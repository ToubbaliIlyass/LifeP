import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { proposals } from '@/lib/db/schema'
import type { NewProposal, Proposal } from '@/lib/db/schema'
import type { BatchOperation } from '@/lib/ai/tools'

export async function createProposal(
  userId: number,
  summary: string,
  operations: BatchOperation[],
  schemaVersion = 0,
): Promise<Proposal> {
  return getDb()
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

/** A claim older than this was interrupted (a crash, a closed laptop), not slow. */
const INTERRUPTED_AFTER_MS = 2 * 60_000

export async function getPendingProposals(userId: number): Promise<Proposal[]> {
  await sweepInterrupted(userId)
  return getDb()
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, userId), eq(proposals.status, 'pending')))
    .orderBy(desc(proposals.createdAt))
    .all()
}

/**
 * A proposal claimed and never finished (a crash, a closed laptop). Its writes
 * were all in one transaction, so none of them happened: it simply waits again.
 */
export async function sweepInterrupted(userId: number, now = Date.now()): Promise<number> {
  const stuck = await getDb()
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, userId), eq(proposals.status, 'executing')))
    .all()
  let closed = 0
  for (const p of stuck) {
    const since = p.resolvedAt ? Date.parse(p.resolvedAt) : 0
    if (now - since < INTERRUPTED_AFTER_MS) continue
    await getDb()
      .update(proposals)
      .set({ status: 'pending', resolvedAt: null })
      .where(and(eq(proposals.id, p.id), eq(proposals.status, 'executing')))
      .run()
    closed++
  }
  return closed
}

export async function getRecentRejections(userId: number, limit = 5): Promise<Proposal[]> {
  return getDb()
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, userId), eq(proposals.status, 'rejected')))
    .orderBy(desc(proposals.resolvedAt))
    .limit(limit)
    .all()
}

/**
 * Takes a pending proposal for execution, once.
 *
 * A conditional update, so of two taps (or two tabs, or a retry) exactly one
 * gets the row back and the other gets nothing — no proposal runs twice, and
 * one that was rejected or already applied cannot be run at all. The row is
 * `executing` until the batch has finished: only then is it `approved`.
 */
export async function claimProposal(id: number, userId: number): Promise<Proposal | undefined> {
  return getDb()
    .update(proposals)
    .set({ status: 'executing', resolvedAt: new Date().toISOString() })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId), eq(proposals.status, 'pending')))
    .returning()
    .get()
}

/** The batch ran: now, and only now, it is approved, with what it did kept for undo. */
export async function finishProposal(id: number, userId: number, executionResult: unknown): Promise<Proposal | undefined> {
  return getDb()
    .update(proposals)
    .set({ status: 'approved', resolvedAt: new Date().toISOString(), executionResult })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId), eq(proposals.status, 'executing')))
    .returning()
    .get()
}

/** The batch did not run (or was rolled back): it waits again, to be retried or dismissed. */
export async function releaseProposal(id: number, userId: number): Promise<void> {
  await getDb()
    .update(proposals)
    .set({ status: 'pending' })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId), eq(proposals.status, 'executing')))
    .run()
}

/** An approved proposal that has been taken back. Only an approved one can be. */
export async function markUndone(id: number, userId: number): Promise<Proposal | undefined> {
  return getDb()
    .update(proposals)
    .set({ status: 'undone', resolvedAt: new Date().toISOString() })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId), eq(proposals.status, 'approved')))
    .returning()
    .get()
}

export async function getProposalById(id: number, userId: number): Promise<Proposal | undefined> {
  return getDb()
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
  return getDb()
    .update(proposals)
    .set({ status: 'rejected', rejectionReason: reason, resolvedAt: new Date().toISOString() })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId), eq(proposals.status, 'pending')))
    .returning()
    .get()
}
