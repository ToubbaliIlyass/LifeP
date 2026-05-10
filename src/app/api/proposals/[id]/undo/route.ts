import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getProposalById, createProposal } from '@/lib/db/proposals'
import type { ExecutionResult } from '@/lib/ai/router'
import type { BatchOperation } from '@/lib/ai/tools'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid proposal ID' }, { status: 400 })

  const proposal = getProposalById(id, user.id)
  if (!proposal) return Response.json({ error: 'Proposal not found' }, { status: 404 })
  if (proposal.status !== 'approved') {
    return Response.json({ error: 'Only approved proposals can be undone' }, { status: 400 })
  }

  const execResult = proposal.executionResult as ExecutionResult | null
  if (!execResult) {
    return Response.json({ error: 'No execution result stored — proposal predates undo support' }, { status: 400 })
  }

  const reverseOps: BatchOperation[] = []

  // Restore updated nodes to their previous properties
  for (const { nodeId, previousProps } of execResult.updatedNodePreviousProps) {
    reverseOps.push({ kind: 'updateNode', nodeId, properties: previousProps })
  }

  // Delete created nodes (cascade handles their edges)
  for (const nodeId of [...execResult.createdNodeIds].reverse()) {
    reverseOps.push({ kind: 'deleteNode', nodeId })
  }

  if (reverseOps.length === 0) {
    return Response.json({ error: 'Nothing to undo (deletions and type promotions cannot be reversed)' }, { status: 400 })
  }

  const undoProposal = createProposal(
    user.id,
    `Undo: ${proposal.summary}`,
    reverseOps,
  )

  return Response.json({ ok: true, undoProposalId: undoProposal.id, summary: undoProposal.summary })
}
