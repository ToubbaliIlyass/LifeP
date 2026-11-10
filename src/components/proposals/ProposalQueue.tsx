'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Inbox, Repeat } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { TUCK_LINES, type TuckState } from '@/lib/tuck/states'
import type { Proposal } from '@/lib/db/schema'
import { notifyDataChanged } from '@/lib/dataSignal'
import { ProposalCard } from './ProposalCard'

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
  /** Tuck's reaction to the last yes or no, for a few seconds. */
  const [note, setNote] = useState<'accepted' | 'declined' | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const react = (approved: boolean) => {
    if (noteTimer.current) clearTimeout(noteTimer.current)
    setNote(approved ? 'accepted' : 'declined')
    noteTimer.current = setTimeout(() => setNote(null), 4500)
  }
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current) }, [])
  // Waiting for a yes: the idea held up. Nothing waiting: the quiet.
  const pose: TuckState = note ?? (proposals && proposals.length === 0 ? 'empty-inbox' : 'proposing')

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
      <div className="w-full mx-auto max-w-[740px] px-12 max-md:px-[18px] pt-10 max-md:pt-2 pb-16 text-[length:calc(14px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))]">
        <div className="md:hidden flex items-center h-9 -mx-1.5 mb-2">
          <button onClick={onOpenMenu} aria-label="Back to lists" className="grid place-items-center w-9 h-9 rounded-md text-muted-foreground active:bg-foreground/[0.06]">
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <Tuck state={pose} size={140} decorative className="max-sm:hidden" />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-[length:calc(22px*var(--ts))] font-bold leading-7 tracking-tight mb-2">
              <Inbox className="w-[22px] h-[22px] text-primary" />To review
            </h1>
            <p className="text-[length:calc(14px*var(--ts))] text-foreground/75">Bigger things the assistant wants to add. Nothing here happens until you say yes.</p>
            {note && <p role="status" className="mt-1.5 text-[length:calc(13.5px*var(--ts))] font-medium">{TUCK_LINES[note]}</p>}
          </div>
        </div>
        {proposals && proposals.length === 0 && (
          <div className="mt-8 max-w-[44ch] text-muted-foreground">
            <b className="flex items-center gap-1.5 mb-1 font-semibold text-foreground"><Repeat className="w-4 h-4" />Nothing waiting.</b>
            Repeating events and new projects the assistant suggests will show up here.
          </div>
        )}
        <ul>
          {proposals?.map((p) => (
            <li key={p.id} className="border-b border-border/70 py-3"><ProposalCard proposal={p} onResolved={(approved) => { react(approved); if (approved) notifyDataChanged(); load() }} /></li>
          ))}
        </ul>
      </div>
    </div>
  )
}
