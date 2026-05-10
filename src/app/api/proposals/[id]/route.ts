import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { approveProposal, rejectProposal } from '@/lib/db/proposals'
import { executeBatch } from '@/lib/ai/router'
import type { BatchOperation } from '@/lib/ai/tools'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid proposal ID' }, { status: 400 })

  const body = await request.json() as { action: 'approve' | 'reject'; reason?: string }

  if (body.action === 'approve') {
    // Mark approved first so we have the proposal data, then execute and store result
    const proposal = approveProposal(id, user.id)
    if (!proposal) return Response.json({ error: 'Proposal not found' }, { status: 404 })
    const ops = proposal.operations as BatchOperation[]
    const { schemaEvolved, result } = executeBatch(user.id, ops, proposal.schemaVersion)
    // Store execution result for undo
    approveProposal(id, user.id, result)
    return Response.json({ ok: true, proposal, schemaEvolved })
  }

  if (body.action === 'reject') {
    const proposal = rejectProposal(id, user.id, body.reason ?? '')
    if (!proposal) return Response.json({ error: 'Proposal not found' }, { status: 404 })
    return Response.json({ ok: true, proposal })
  }

  return Response.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
}
