import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { inTransaction } from '@/lib/db'
import { claimProposal, finishProposal, getProposalById, rejectProposal, releaseProposal } from '@/lib/db/proposals'
import { resolvePlanDates, withoutMoves, withoutNodes } from '@/lib/plan-compile'
import { executeBatch, staleOperations } from '@/lib/ai/router'
import type { BatchOperation } from '@/lib/ai/tools'
import { replanDay } from '@/lib/schedule-day'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { logger } from '@/lib/log'

/** What, once approved, changes the day: it has to be planned right away. */
const PLANNED_TYPES = new Set(['Task', 'Event'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid proposal ID' }, { status: 400 })

  const body = await request.json() as { action: 'approve' | 'reject'; reason?: string; tz?: string; exclude?: unknown; excludeMoves?: unknown }

  if (body.action === 'approve') {
    // Taken exactly once: a second tap, another tab or a retry finds it already claimed.
    const proposal = await claimProposal(id, user.id)
    if (!proposal) {
      const current = await getProposalById(id, user.id)
      if (!current) return Response.json({ error: 'Proposal not found' }, { status: 404 })
      return Response.json({ error: `This is already ${current.status === 'executing' ? 'being added' : current.status}.`, status: current.status }, { status: 409 })
    }
    const stored = proposal.operations as BatchOperation[]

    let ops = stored
    let done: Awaited<ReturnType<typeof finishProposal>>
    let schemaEvolved = false
    try {
      // What it points at may have changed since it was suggested.
      const stale = await staleOperations(user.id, stored, proposal.createdAt)
      if (stale.length) {
        await releaseProposal(id, user.id)
        return Response.json({ error: 'This changed since it was suggested, so it was not applied.', stale }, { status: 409 })
      }
      // The user's own today, and the steps they left unticked: a plan starts when it is approved, as trimmed.
      const settings = await readSettings(user.id)
      const today = clockIn(zoneFor(body.tz, settings.timeZone, settings.timeZoneOverride)).date
      const exclude = Array.isArray(body.exclude) ? body.exclude.filter((n): n is number => Number.isInteger(n) && n >= 0) : []
      const excludeMoves = Array.isArray(body.excludeMoves) ? body.excludeMoves.filter((n): n is number => Number.isInteger(n) && n >= 0) : []
      ops = resolvePlanDates(withoutMoves(withoutNodes(stored, exclude), excludeMoves), today)

      /*
       * One transaction: every write the batch makes, and the note that it was
       * approved, commit together or not at all. If anything throws, the
       * database itself undoes all of it; there is nothing to clean up by hand,
       * and nothing is ever half there. A crash does the same.
       */
      const run = await inTransaction(async () => {
        const executed = await executeBatch(user.id, ops, proposal.schemaVersion)
        const finished = await finishProposal(id, user.id, executed.result)
        if (!finished) throw new Error('This proposal was taken by something else.')
        return { finished, schemaEvolved: executed.schemaEvolved }
      })
      done = run.finished
      schemaEvolved = run.schemaEvolved
    } catch (error) {
      // Nothing was written. It waits again, to be retried or dismissed.
      logger.warn('proposal_failed', { id, message: error instanceof Error ? error.message : String(error) })
      await releaseProposal(id, user.id).catch(() => {})
      return Response.json({ error: error instanceof Error ? error.message : 'Something went wrong. Nothing was changed. Try again.' }, { status: 500 })
    }

    /*
     * A repeating to-do or a recurring commitment said in the chat waits here for a
     * yes — and used to wait again after it: approved, it sat off the plan
     * until someone pressed Plan. Approving is the yes, so today is laid
     * out again around it at once. A failure here does not undo the
     * approval; the next Plan or capture picks it up.
     */
    let planned: number | null = null
    if (ops.some((op) => (op.kind === 'createNode' && PLANNED_TYPES.has(op.type)) || op.kind === 'updateNode')) {
      try {
        const settings = await readSettings(user.id)
        const clock = clockIn(zoneFor(body.tz, settings.timeZone, settings.timeZoneOverride))
        planned = (await replanDay(user.id, clock.date, clock)).placements.length
      } catch (error) {
        logger.warn('replan_after_approve_failed', { message: error instanceof Error ? error.message : String(error) })
      }
    }
    return Response.json({ ok: true, proposal: done ?? proposal, schemaEvolved, planned })
  }

  if (body.action === 'reject') {
    const proposal = await rejectProposal(id, user.id, body.reason ?? '')
    if (!proposal) {
      const current = await getProposalById(id, user.id)
      if (!current) return Response.json({ error: 'Proposal not found' }, { status: 404 })
      return Response.json({ error: `This is already ${current.status === 'executing' ? 'being added' : current.status}.`, status: current.status }, { status: 409 })
    }
    return Response.json({ ok: true, proposal })
  }

  return Response.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
}
