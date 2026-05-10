'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Proposal } from '@/lib/db/schema'
import type { BatchOperation } from '@/lib/ai/tools'

// --- Pending count badge (exported for header use) ---

interface PendingBadgeProps {
  count: number
  onClick: () => void
}

export function ProposalBadge({ count, onClick }: PendingBadgeProps) {
  if (count === 0) return null
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
    >
      <span>{count} pending</span>
      <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center text-[10px] border-amber-400 text-amber-700">
        {count}
      </Badge>
    </button>
  )
}

// --- Operation detail renderer ---

function OperationDetail({ op }: { op: BatchOperation }) {
  switch (op.kind) {
    case 'createNode':
      return (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">+ {op.type}</span>
          {' — '}
          {JSON.stringify(op.properties)}
        </div>
      )
    case 'createEdge':
      return (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">→ edge &quot;{op.type}&quot;</span>
          {' '}({op.sourceRef} → {op.targetRef})
        </div>
      )
    case 'updateNode':
      return (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">~ update node {op.nodeId}</span>
          {' — '}{JSON.stringify(op.properties)}
        </div>
      )
    case 'deleteNode':
      return (
        <div className="text-xs text-destructive font-medium">
          ✕ delete node {op.nodeId}
        </div>
      )
  }
}

// --- Single proposal card ---

interface ProposalCardProps {
  proposal: Proposal
  onResolved: () => void
  onApproved: () => void
}

function ProposalCard({ proposal, onResolved, onApproved }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const ops = proposal.operations as BatchOperation[]

  async function handle(action: 'approve' | 'reject') {
    setBusy(true)
    await fetch(`/api/proposals/${proposal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason: action === 'reject' ? reason : undefined }),
    })
    setBusy(false)
    if (action === 'approve') onApproved()
    onResolved()
  }

  return (
    <div className="border rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{proposal.summary}</p>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-muted-foreground shrink-0 mt-0.5 hover:text-foreground"
        >
          {expanded ? 'hide' : `${ops.length} op${ops.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {expanded && (
        <div className="space-y-1 pl-1 border-l-2 border-muted">
          {ops.map((op, i) => <OperationDetail key={i} op={op} />)}
        </div>
      )}

      {rejecting ? (
        <div className="space-y-1.5">
          <input
            autoFocus
            className="w-full text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Reason for rejecting (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handle('reject')
              if (e.key === 'Escape') setRejecting(false)
            }}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => handle('reject')} className="h-6 text-xs px-2">
              Confirm reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} className="h-6 text-xs px-2">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => handle('approve')} className="h-6 text-xs px-2">
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)} className="h-6 text-xs px-2">
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}

// --- Full proposal queue panel ---

interface ProposalQueueProps {
  onCountChange: (n: number) => void
  onApproved: () => void
}

export function ProposalQueue({ onCountChange, onApproved }: ProposalQueueProps) {
  const [proposals, setProposals] = useState<Proposal[]>([])

  const load = useCallback(() => {
    fetch('/api/proposals')
      .then((r) => r.json())
      .then(({ proposals: p }: { proposals: Proposal[] }) => {
        setProposals(p)
        onCountChange(p.length)
      })
  }, [onCountChange])

  useEffect(() => { load() }, [load])

  return (
    <ScrollArea className="h-full">
      {proposals.length === 0 ? (
        <p className="text-[13px] text-muted-foreground/50 text-center pt-12 font-serif italic">
          No pending proposals
        </p>
      ) : (
        <div className="p-5 space-y-3 max-w-2xl">
          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} onResolved={load} onApproved={onApproved} />
          ))}
        </div>
      )}
    </ScrollArea>
  )
}
