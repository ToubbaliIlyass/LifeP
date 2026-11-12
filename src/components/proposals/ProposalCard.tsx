'use client'

import { toastError } from '@/lib/toast'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import type { Proposal } from '@/lib/db/schema'
import type { BatchOperation } from '@/lib/ai/tools'
import type { MoveTag } from '@/lib/plan-compile'
import { notifyDataChanged } from '@/lib/dataSignal'
import { daysLabel } from '@/lib/days'
import { clockZone } from '@/lib/wallclock'
import { offerUndo, undoProposal } from '@/lib/proposal-undo'
import { useUndo } from '@/components/undo/UndoProvider'
import { BTN_PRIMARY, BTN_GHOST } from '@/components/ui/buttons'

/** What a created thing is called on screen, by the type it is stored as. */
const NOUN: Record<string, string> = {
  Task: 'to-do', Event: 'event', Project: 'project', Goal: 'area', Note: 'note', Milestone: 'step',
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
    if (op.type === 'Task') {
      const rec = p.recurrence as { frequency?: string; daysOfWeek?: number[] } | undefined
      const repeats = rec?.frequency === 'daily' ? 'every day' : rec?.frequency === 'weekdays' ? 'weekdays' : rec?.frequency === 'weekly' ? daysLabel(rec.daysOfWeek ?? []) : ''
      const first = typeof p.dueDate === 'string' ? `from ${p.dueDate}${rec && typeof p.deadline === 'string' ? ` until ${p.deadline}` : ''}` : ''
      const mins = typeof p.estimatedMinutes === 'number' ? `${p.estimatedMinutes} min` : ''
      when = [repeats, first, mins].filter(Boolean).join(' · ')
      return { text: `${name ? `“${name}”` : 'To-do'}${when ? `, ${when}` : ''}` }
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

const moveOf = (op: BatchOperation) => (op as { move?: MoveTag }).move

/**
 * One proposal, as a person reads it, with what they can change before saying yes.
 *
 * A plan lists its steps; an areas proposal lists areas and what is under them; a
 * rearrangement shows each move as where it was and where it goes. Steps,
 * areas and moves each have a tick to leave them out. Approving applies it
 * (as one transaction, server side) and offers Undo. In the list it is a row;
 * in Tuck's full-screen conversation (`variant="screen"`) it is the same thing, larger.
 */
export function ProposalCard({ proposal, onResolved, variant = 'row', autoApply = false }: {
  proposal: Proposal
  onResolved: (approved: boolean) => void
  variant?: 'row' | 'screen'
  /** Just do it (with Undo) instead of asking: for the small, plain additions. */
  autoApply?: boolean
}) {
  const [busy, setBusy] = useState(false)
  /** Why the last press did not work, in words: shown, not swallowed. */
  const [problem, setProblem] = useState<{ text: string; stale?: boolean } | null>(null)
  useEffect(() => { if (problem) toastError('That didn’t work', problem.text, 'acture-proposal-problem') }, [problem])
  const { record } = useUndo()
  const ops = proposal.operations as BatchOperation[]
  const [summary, ...why] = proposal.summary.split('\n\n')
  const big = variant === 'screen'

  const hasMoves = ops.some((o) => moveOf(o))
  const isPlan = ops.some((o) => o.kind === 'createNode' && (o as { plan?: unknown }).plan)
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [skippedMoves, setSkippedMoves] = useState<Set<number>>(new Set())
  const flip = (set: Set<number>, n: number) => { const x = new Set(set); if (x.has(n)) x.delete(n); else x.add(n); return x }

  // Lines for what is created or changed; the links between them are left out of plans, areas and moves.
  let created = -1
  const hideLinks = isPlan || hasMoves || ops.some((o) => o.kind === 'createNode' && o.type === 'Goal')
  const lines = ops.flatMap((op) => {
    if (op.kind === 'createNode') created++
    if (hideLinks && (op.kind === 'createEdge' || op.kind === 'deleteEdge')) return []
    const l = describe(op, ops)
    return l ? [{ ...l, node: op.kind === 'createNode' ? created : null, ticked: op.kind === 'createNode' && (op.type === 'Task' || op.type === 'Goal') }] : []
  })
  const tickable = lines.filter((l) => l.ticked).length
  const trimmable = tickable >= 2

  // Moves, grouped by where they go.
  const moves = new Map<number, MoveTag>()
  for (const op of ops) { const m = moveOf(op); if (m && !moves.has(m.id)) moves.set(m.id, m) }
  const toDos = [...moves.values()].filter((m) => !m.kind || m.kind === 'move')
  const listChanges = [...moves.values()].filter((m) => m.kind === 'rename' || m.kind === 'merge')
  const groups = toDos.reduce((acc, m) => { (acc[m.to] ??= []).push(m); return acc }, {} as Record<string, MoveTag[]>)
  const kept = moves.size - skippedMoves.size

  async function resolve(action: 'approve' | 'reject') {
    if (busy) return
    setBusy(true)
    setProblem(null)
    const res = await fetch(`/api/proposals/${proposal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Approving plans today around what was approved, in the user's today, minus what they left unticked.
      body: JSON.stringify({ action, tz: clockZone(), ...(action === 'approve' && skipped.size ? { exclude: [...skipped] } : {}), ...(action === 'approve' && skippedMoves.size ? { excludeMoves: [...skippedMoves] } : {}) }),
    }).catch(() => null)
    setBusy(false)
    if (!res) { setProblem({ text: 'No connection. Nothing was changed. Try again.' }); return }
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string; stale?: string[]; status?: string }
      // Already done elsewhere (another tab, a double tap): it is not waiting any more, so let it go.
      if (res.status === 409 && d.status === 'executing') { setProblem({ text: 'This is still being added. Give it a moment.' }); return }
      if (res.status === 409 && !d.stale) { onResolved(d.status === 'approved'); return }
      setProblem({ text: d.stale?.length ? `${d.error} ${d.stale.slice(0, 2).join('. ')}.` : (d.error ?? 'That did not work. Nothing was changed.'), stale: !!d.stale })
      return
    }
    if (action === 'approve') {
      // Cmd+Z, and a visible Undo for the screens with no keyboard.
      record(`Added ${summary}`, async () => { await undoProposal(proposal.id, () => true) })
      offerUndo({ proposalId: proposal.id, label: summary })
      notifyDataChanged()
    }
    onResolved(action === 'approve')
  }

  const auto = useRef(false)
  useEffect(() => {
    if (autoApply && !auto.current) { auto.current = true; void resolve('approve') }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [autoApply])

  const tick = (on: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} aria-pressed={on} aria-label={label} className={`grid shrink-0 place-items-center rounded-[4px] border-[1.5px] ${big ? 'h-[20px] w-[20px]' : 'h-[15px] w-[15px]'} ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
      {on && <Check className={big ? 'h-[14px] w-[14px]' : 'h-[11px] w-[11px]'} strokeWidth={3.2} />}
    </button>
  )
  const total = moves.size > 0 ? kept : tickable - skipped.size
  const addLabel = busy ? 'Adding…' : moves.size > 0 ? (listChanges.length ? (skippedMoves.size ? `Apply ${kept} of ${moves.size}` : `Apply ${moves.size}`) : skippedMoves.size ? `Move ${kept} of ${moves.size}` : `Move ${moves.size}`) : trimmable && skipped.size ? `Add ${total} of ${tickable}` : 'Yes, add it'

  return (
    <div className={big ? 'rounded-2xl border border-border/70 bg-card p-5 text-left shadow-[0_2px_12px_oklch(0_0_0/0.06)]' : ''}>
      <p className={big ? 'text-[length:calc(19px*var(--ts))] font-bold leading-snug tracking-tight' : 'font-medium'}>{summary}</p>
      {why.join('\n\n').trim() && <p className={`mt-0.5 text-muted-foreground ${big ? 'text-[length:calc(14.5px*var(--ts))]' : 'text-[length:calc(13px*var(--ts))]'}`}>{why.join('\n\n').trim()}</p>}

      {/* A rearrangement: where each thing was, and where it goes. */}
      {moves.size > 0 && (
        <div className={`mt-2 space-y-3 ${big ? 'text-[length:calc(15px*var(--ts))]' : 'text-[length:calc(13px*var(--ts))]'}`}>
          {listChanges.length > 0 && (
            <ul className="space-y-1">
              {listChanges.map((m) => {
                const off = skippedMoves.has(m.id)
                return (
                  <li key={m.id} className={`flex items-center gap-2 ${off ? 'text-muted-foreground/60 line-through' : 'text-foreground/85'}`}>
                    {tick(!off, off ? `Apply this after all` : `Leave “${m.todo}” as it is`, () => setSkippedMoves((cur) => flip(cur, m.id)))}
                    {m.kind === 'rename'
                      ? <span className="min-w-0 flex-1 truncate">Rename “{m.from}” <ArrowRight className="mx-0.5 inline h-3.5 w-3.5 text-primary" /> “{m.to}”</span>
                      : <span className="min-w-0 flex-1 truncate">Merge “{m.todo}” into “{m.to}”{m.count ? <span className="text-muted-foreground"> · {m.count} item{m.count === 1 ? '' : 's'} go across</span> : null}</span>}
                  </li>
                )
              })}
            </ul>
          )}
          {Object.entries(groups).map(([to, list]) => (
            <div key={to}>
              <p className="mb-1 flex items-center gap-1.5 font-semibold"><ArrowRight className="h-3.5 w-3.5 text-primary" /> {to}</p>
              <ul className="space-y-1">
                {list.map((m) => {
                  const off = skippedMoves.has(m.id)
                  return (
                    <li key={m.id} className={`flex items-center gap-2 ${off ? 'text-muted-foreground/60 line-through' : 'text-foreground/85'}`}>
                      {tick(!off, off ? `Move “${m.todo}” after all` : `Leave “${m.todo}” where it is`, () => setSkippedMoves((cur) => flip(cur, m.id)))}
                      <span className="min-w-0 flex-1 truncate">{m.todo}</span>
                      <span className="shrink-0 text-[length:calc(12px*var(--ts))] text-muted-foreground no-underline">{m.from ? `from ${m.from}` : 'was loose'}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <ul className={`mt-2 space-y-1 ${big ? 'text-[length:calc(15px*var(--ts))]' : 'text-[length:calc(13px*var(--ts))] space-y-0.5 mt-1.5'}`}>
          {lines.map((l, i) => {
            const off = l.node !== null && skipped.has(l.node)
            return (
              <li key={i} className={`flex items-center gap-2 ${l.danger ? 'text-red-500' : off ? 'text-muted-foreground/60 line-through' : 'text-foreground/80'}`}>
                {trimmable && l.ticked && l.node !== null
                  ? tick(!off, off ? `Add “${l.text}” back` : `Leave out “${l.text}”`, () => setSkipped((cur) => flip(cur, l.node!)))
                  : <span className="mx-[5px] h-1 w-1 shrink-0 rounded-full bg-current" />}
                <span className="min-w-0">{l.text}</span>
              </li>
            )
          })}
        </ul>
      )}

      <div className={`flex gap-2 ${big ? 'mt-4' : 'mt-2.5'}`}>
        {!problem?.stale && (
          <button onClick={() => resolve('approve')} disabled={busy || (moves.size > 0 && kept === 0)} className={BTN_PRIMARY}>{addLabel}</button>
        )}
        <button onClick={() => resolve('reject')} disabled={busy} className={BTN_GHOST}>{problem?.stale ? 'Dismiss it' : 'No'}</button>
      </div>
    </div>
  )
}
