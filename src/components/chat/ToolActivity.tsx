'use client'

import { Inbox, Link2, Plus, Pencil, Search, Sparkles, Loader2 } from 'lucide-react'
import type { BatchOperation } from '@/lib/ai/tools'

/**
 * Renders one AI tool call as a visible row in the chat.
 *
 * Before this existed the AI's graph writes were invisible: the model said it
 * had done something and the user had to go hunt for it in the Proposals tab.
 * Reads render as a faint one-liner; writes render as a concrete statement of
 * what changed; proposals render as an actionable card.
 */

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied'

export interface ToolPart {
  type: string
  state: ToolState
  input?: unknown
  output?: unknown
  errorText?: string
}

export function isToolPart(part: { type: string }): part is ToolPart {
  return part.type.startsWith('tool-') || part.type === 'dynamic-tool'
}

function toolName(part: ToolPart): string {
  return part.type.startsWith('tool-') ? part.type.slice(5) : 'unknown'
}

const ICON = 'w-3 h-3 shrink-0'

function Row({
  icon,
  children,
  faint = false,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  faint?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-1.5 text-[11.5px] leading-tight ${
        faint ? 'text-muted-foreground/45' : 'text-muted-foreground'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </div>
  )
}

function label(props: Record<string, unknown> | undefined): string {
  if (!props) return ''
  const name = props.name ?? props.title
  return typeof name === 'string' ? name : ''
}

function describeOps(ops: BatchOperation[]): string {
  const nodes = ops.filter((o) => o.kind === 'createNode').length
  const edges = ops.filter((o) => o.kind === 'createEdge').length
  const updates = ops.filter((o) => o.kind === 'updateNode').length
  const deletes = ops.filter((o) => o.kind === 'deleteNode').length
  const parts: string[] = []
  if (nodes) parts.push(`${nodes} new ${nodes === 1 ? 'node' : 'nodes'}`)
  if (edges) parts.push(`${edges} ${edges === 1 ? 'link' : 'links'}`)
  if (updates) parts.push(`${updates} ${updates === 1 ? 'edit' : 'edits'}`)
  if (deletes) parts.push(`${deletes} ${deletes === 1 ? 'deletion' : 'deletions'}`)
  return parts.join(' · ') || 'no changes'
}

interface ToolActivityProps {
  part: ToolPart
  onReviewProposals?: () => void
}

export function ToolActivity({ part, onReviewProposals }: ToolActivityProps) {
  const name = toolName(part)
  const input = (part.input ?? {}) as Record<string, unknown>
  const pending = part.state === 'input-streaming' || part.state === 'input-available'

  if (part.state === 'output-error') {
    return (
      <div className="text-[11.5px] text-destructive/80">
        {name} failed — {part.errorText}
      </div>
    )
  }

  // ── Proposals: the one thing that needs the user to act ──────────────
  if (name === 'batchPropose' || name === 'deleteNode' || name === 'proposeNodeType') {
    const ops = Array.isArray(input.operations) ? (input.operations as BatchOperation[]) : []
    const summary =
      typeof input.summary === 'string'
        ? input.summary
        : name === 'deleteNode'
          ? `Delete node ${input.nodeId ?? ''}`
          : name === 'proposeNodeType'
            ? `New node type: ${input.name ?? ''}`
            : 'Preparing a proposal…'

    if (pending) {
      return (
        <Row icon={<Loader2 className={`${ICON} animate-spin`} />} faint>
          Preparing a proposal…
        </Row>
      )
    }

    return (
      <div className="border border-border/60 bg-muted/30 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
        <Inbox className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">
            Awaiting your approval
          </p>
          <p className="text-[12.5px] font-medium text-foreground leading-snug mt-1">{summary}</p>
          {ops.length > 0 && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{describeOps(ops)}</p>
          )}
          {onReviewProposals && (
            <button
              onClick={onReviewProposals}
              className="mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Review
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Direct writes: state what actually changed ───────────────────────
  if (name === 'createNode') {
    const props = input.properties as Record<string, unknown> | undefined
    const n = label(props)
    return (
      <Row icon={<Plus className={ICON} />}>
        {pending ? 'Adding…' : `Added ${input.type ?? 'node'}${n ? ` — ${n}` : ''}`}
      </Row>
    )
  }

  if (name === 'createEdge') {
    const out = part.output as { duplicate?: boolean } | undefined
    const link = `#${input.sourceId} → #${input.targetId} as "${input.type}"`
    return (
      <Row icon={<Link2 className={ICON} />} faint={out?.duplicate}>
        {pending
          ? 'Linking…'
          : out?.duplicate
            ? `Already linked ${link}`
            : `Linked ${link}`}
      </Row>
    )
  }

  if (name === 'updateNodeProperties') {
    const props = (input.properties ?? {}) as Record<string, unknown>
    const changed = Object.entries(props)
      .map(([k, v]) => `${k} → ${String(v)}`)
      .join(', ')
    const out = part.output as { node?: { name?: unknown } } | undefined
    const n = typeof out?.node?.name === 'string' ? out.node.name : `#${input.nodeId}`
    return (
      <Row icon={<Pencil className={ICON} />}>
        {pending ? 'Updating…' : `Updated ${n}${changed ? ` — ${changed}` : ''}`}
      </Row>
    )
  }

  // ── Reads: present but deliberately quiet ────────────────────────────
  if (name === 'readGraph' || name === 'searchNodes' || name === 'getNodeDetail') {
    const out = part.output as { count?: number; nodes?: unknown[] } | undefined
    const count = out?.count ?? out?.nodes?.length
    return (
      <Row
        icon={pending ? <Loader2 className={`${ICON} animate-spin`} /> : <Search className={ICON} />}
        faint
      >
        {pending
          ? 'Checking your graph…'
          : name === 'searchNodes'
            ? `Searched "${input.query}"${count !== undefined ? ` — ${count} found` : ''}`
            : 'Checked your graph'}
      </Row>
    )
  }

  return (
    <Row icon={<Sparkles className={ICON} />} faint>
      {name}
    </Row>
  )
}
