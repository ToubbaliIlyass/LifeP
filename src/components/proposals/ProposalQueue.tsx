'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, Inbox, Repeat } from 'lucide-react'
import type { Proposal } from '@/lib/db/schema'
import type { BatchOperation } from '@/lib/ai/tools'
import { notifyDataChanged } from '@/lib/dataSignal'
import { daysLabel } from '@/lib/days'
import { clockZone } from '@/lib/wallclock'

/** What a created thing is called on screen, by the type it is stored as. */
const NOUN: Record<string, string> = {
  Task: 'to-do', Event: 'event', Project: 'project', Goal: 'area', Habit: 'repeating to-do', Note: 'note', Milestone: 'step',
}

const nameOf = (p: Record<string, unknown>) =>
  typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : null

/** One operation, said the way a person would: "Add event “Compilers”, Tue and Thu at 10:00". */
function describe(op: BatchOperation, ops: BatchOperation[]): { text: string; danger?: boolean } | null {
  if (op.kind === 'createNode') {
    const p = op.properties
    const name = nameOf(p)
    let when = ''
    if (op.type === 'Event') {
      const repeats = typeof p.frequency === 'string' && p.frequency !== 'once'
      const days = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : []
      when = repeats
        ? `, ${p.frequency === 'daily' ? 'every day' : p.frequency === 'weekdays' ? 'weekdays' : daysLabel(days)}`
        : typeof p.date === 'string' ? `, ${p.date}` : ''
      if (typeof p.time === 'string') when += ` at ${p.time}`
    }
    return { text: `Add ${NOUN[op.type] ?? op.type.toLowerCase()}${name ? ` “${name}”` : ''}${when}` }
  }
  if (op.kind === 'createEdge') {
    // Only links between two things this proposal makes can be named; the
    // rest point at something already there.
    const created = ops.filter((o): o is Extract<BatchOperation, { kind: 'createNode' }> => o.kind === 'createNode')
    const label = (ref: string) => {
      if (!ref.startsWith('$')) return 'something you already have'
      const n = created[Number(ref.slice(1))]
      return n ? `“${nameOf(n.properties) ?? NOUN[n.type] ?? 'it'}”` : 'it'
    }
    return { text: `Put ${label(op.sourceRef)} under ${label(op.targetRef)}` }
  }
  if (op.kind === 'updateNode') return { text: `Change ${nameOf(op.properties) ? `“${nameOf(op.properties)}”` : 'an item'}` }
  if (op.kind === 'deleteNode') return { text: 'Delete an item', danger: true }
  return null
}

function ProposalRow({ proposal, onResolved }: { proposal: Proposal; onResolved: (approved: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const ops = proposal.operations as BatchOperation[]
  const [summary, ...why] = proposal.summary.split('\n\n')
  const lines = ops.map((op) => describe(op, ops)).filter((l): l is NonNullable<typeof l> => !!l)

  async function resolve(action: 'approve' | 'reject') {
    setBusy(true)
    await fetch(`/api/proposals/${proposal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Approving plans today around what was approved — in the user's today.
      body: JSON.stringify({ action, tz: clockZone() }),
    }).catch(() => {})
    setBusy(false)
    onResolved(action === 'approve')
  }

  return (
    <li className="py-3 border-b border-border/70">
      <p className="font-medium">{summary}</p>
      {why.join('\n\n').trim() && <p className="mt-0.5 text-[13px] text-muted-foreground">{why.join('\n\n').trim()}</p>}
      <ul className="mt-1.5 space-y-0.5 text-[13px]">
        {lines.map((l, i) => (
          <li key={i} className={`flex items-center gap-1.5 ${l.danger ? 'text-red-500' : 'text-foreground/75'}`}>
            <span className="w-1 h-1 rounded-full bg-current shrink-0" />{l.text}
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5 mt-2.5">
        <button onClick={() => resolve('approve')} disabled={busy} className="rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50">
          Yes, add it
        </button>
        <button onClick={() => resolve('reject')} disabled={busy} className="rounded-md border border-border/80 px-2.5 py-1 text-[13px] font-medium hover:bg-foreground/[0.05] disabled:opacity-50">
          No
        </button>
      </div>
    </li>
  )
}

/**
 * What the assistant would like to add, waiting for a yes.
 *
 * Only the bigger things wait here — a repeating event, a new project or
 * area — so a misheard sentence or a misread timetable cannot quietly fill a
 * week. Drawn as one more list, in plain words rather than the operations
 * underneath.
 */
export function ProposalQueue({ onCountChange, onOpenMenu }: {
  onCountChange: (n: number) => void
  /** Back to the lists, on a phone. */
  onOpenMenu: () => void
}) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null)

  const load = useCallback(() => {
    fetch('/api/proposals')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { proposals: Proposal[] } | null) => {
        if (!d) return
        setProposals(d.proposals)
        onCountChange(d.proposals.length)
      })
      .catch(() => {})
  }, [onCountChange])

  useEffect(() => { load() }, [load])

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto max-w-[740px] px-12 max-md:px-[18px] pt-10 max-md:pt-2 pb-16 text-[14px] max-md:text-[15px]">
        <div className="md:hidden flex items-center h-9 -mx-1.5 mb-2">
          <button onClick={onOpenMenu} aria-label="Back to lists" className="grid place-items-center w-9 h-9 rounded-md text-muted-foreground active:bg-foreground/[0.06]">
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>
        <h1 className="flex items-center gap-2.5 text-[22px] font-bold leading-7 tracking-tight mb-2">
          <Inbox className="w-[22px] h-[22px] text-primary" />To review
        </h1>
        <p className="mb-4 text-[14px] text-foreground/75">Bigger things the assistant wants to add. Nothing here happens until you say yes.</p>
        {proposals && proposals.length === 0 && (
          <div className="mt-8 max-w-[44ch] text-muted-foreground">
            <b className="flex items-center gap-1.5 mb-1 font-semibold text-foreground"><Repeat className="w-4 h-4" />Nothing waiting.</b>
            Repeating events and new projects the assistant suggests will show up here.
          </div>
        )}
        <ul>
          {proposals?.map((p) => (
            <ProposalRow key={p.id} proposal={p} onResolved={(approved) => { if (approved) notifyDataChanged(); load() }} />
          ))}
        </ul>
      </div>
    </div>
  )
}
