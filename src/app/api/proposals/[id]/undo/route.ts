import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { inTransaction } from '@/lib/db'
import { getProposalById, markUndone } from '@/lib/db/proposals'
import { changedSinceApproval, rollbackBatch, type ExecutionResult } from '@/lib/ai/router'
import { replanDay } from '@/lib/schedule-day'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { logger } from '@/lib/log'

class AlreadyUndone extends Error {}

/**
 * Takes an approved proposal back out, from what it recorded when it ran.
 *
 * Refuses (409) when something it made has been edited since, unless the
 * caller says `force`: undoing would throw those edits away, and that is the
 * user's call. Body: { force?: boolean, tz?: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid proposal ID' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as { force?: boolean; tz?: string }

  const proposal = await getProposalById(id, user.id)
  if (!proposal) return Response.json({ error: 'Proposal not found' }, { status: 404 })
  if (proposal.status !== 'approved' || !proposal.executionResult) {
    return Response.json({ error: proposal.status === 'undone' ? 'Already undone.' : 'Only something that was added can be undone.', status: proposal.status }, { status: 409 })
  }
  const result = proposal.executionResult as ExecutionResult

  if (!body.force && proposal.resolvedAt) {
    const changed = await changedSinceApproval(user.id, result, proposal.resolvedAt)
    if (changed.length) return Response.json({ error: 'Some of it has been edited since.', changed }, { status: 409 })
  }

  // One transaction: marked undone and everything taken back, or neither. Two taps cannot both win:
  // the conditional update inside it only succeeds once.
  let counts: Awaited<ReturnType<typeof rollbackBatch>>
  try {
    counts = await inTransaction(async () => {
      const claimed = await markUndone(id, user.id)
      if (!claimed) throw new AlreadyUndone()
      const back = await rollbackBatch(user.id, result)
      // A step that could not be taken back would leave it half undone: refuse, and the database restores everything.
      if (back.errors.length) throw new Error(back.errors.join('; '))
      return back
    })
  } catch (error) {
    if (error instanceof AlreadyUndone) return Response.json({ error: 'Already undone.' }, { status: 409 })
    logger.warn('undo_failed', { id, message: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: 'Some of it could not be taken back, so nothing was changed. Try again.' }, { status: 500 })
  }
  try {
    const settings = await readSettings(user.id)
    const clock = clockIn(zoneFor(body.tz, settings.timeZone, settings.timeZoneOverride))
    await replanDay(user.id, clock.date, clock)
  } catch (error) {
    logger.warn('replan_after_undo_failed', { message: error instanceof Error ? error.message : String(error) })
  }
  return Response.json({ ok: true, removed: counts.removed, restored: counts.restored, kept: counts.kept })
}
