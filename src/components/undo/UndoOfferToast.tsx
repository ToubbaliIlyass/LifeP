'use client'

import { useEffect, useRef, useState } from 'react'
import { ToastCard } from '@/components/ui/ToastCard'
import { UNDO_OFFER, undoProposal, type UndoOffer } from '@/lib/proposal-undo'

/** How long the offer stays, in ms: long enough to read and decide, short enough not to nag. */
const STAY = 12_000

/**
 * "Added. Undo": the visible way back after approving something, for the
 * screens that have no keyboard (Cmd+Z is not enough on a phone). It asks
 * before throwing away anything edited since, and says what happened.
 */
export function UndoOfferToast() {
  const [offer, setOffer] = useState<UndoOffer | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const on = (e: Event) => {
      setNote(null)
      setOffer((e as CustomEvent<UndoOffer>).detail)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setOffer(null), STAY)
    }
    window.addEventListener(UNDO_OFFER, on)
    return () => { window.removeEventListener(UNDO_OFFER, on); if (timer.current) clearTimeout(timer.current) }
  }, [])

  if (!offer) return null

  async function undo() {
    if (!offer || busy) return
    setBusy(true)
    if (timer.current) clearTimeout(timer.current)
    const said = await undoProposal(offer.proposalId, (changed) => window.confirm(`You’ve edited ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ' and more' : ''} since. Undo anyway and lose those edits?`))
    setBusy(false)
    setNote(said)
    timer.current = setTimeout(() => setOffer(null), 4000)
  }

  return (
    <ToastCard
      tuck="confirmed"
      text={note ?? `Added: ${offer.label}`}
      action={note ? undefined : { label: busy ? 'Undoing…' : 'Undo', onClick: undo, busy }}
      onDismiss={() => setOffer(null)}
      timerKey={`${offer.proposalId}:${note ?? ''}`}
      seconds={(note ? 4_000 : STAY) / 1000}
    />
  )
}
