import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { approveProposal, rejectProposal } from '@/lib/db/proposals'
import { executeBatch } from '@/lib/ai/router'
import type { BatchOperation } from '@/lib/ai/tools'
import { replanDay } from '@/lib/schedule-day'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { logger } from '@/lib/log'

/** What, once approved, changes the day: it has to be planned right away. */
const PLANNED_TYPES = new Set(['Task', 'Habit', 'Event'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid proposal ID' }, { status: 400 })

  const body = await request.json() as { action: 'approve' | 'reject'; reason?: string; tz?: string }

  if (body.action === 'approve') {
    // Mark approved first so we have the proposal data, then execute and store result
    const proposal = await approveProposal(id, user.id)
    if (!proposal) return Response.json({ error: 'Proposal not found' }, { status: 404 })
    const ops = proposal.operations as BatchOperation[]
    const { schemaEvolved, result } = await executeBatch(user.id, ops, proposal.schemaVersion)
    // Store execution result for undo
    await approveProposal(id, user.id, result)

    /*
     * A habit or a recurring commitment said in the chat waits here for a
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
    return Response.json({ ok: true, proposal, schemaEvolved, planned })
  }

  if (body.action === 'reject') {
    const proposal = await rejectProposal(id, user.id, body.reason ?? '')
    if (!proposal) return Response.json({ error: 'Proposal not found' }, { status: 404 })
    return Response.json({ ok: true, proposal })
  }

  return Response.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
}
