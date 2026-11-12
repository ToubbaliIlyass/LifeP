'use client'

import { useEffect } from 'react'
import { toastDismiss, toastNote, toastUndo } from '@/lib/toast'
import { UNDO_OFFER, undoProposal, type UndoOffer } from '@/lib/proposal-undo'

const ID = 'acture-undo-offer'

/**
 * "Added. Undo": the visible way back after approving something, for the
 * screens that have no keyboard (Cmd+Z is not enough on a phone). It asks
 * before throwing away anything edited since, and says what happened. Renders
 * nothing itself: the island (ActureToaster) is where it shows.
 */
export function UndoOfferToast() {
  useEffect(() => {
    const on = (e: Event) => {
      const offer = (e as CustomEvent<UndoOffer>).detail
      toastUndo('Added', offer.label, async () => {
        const said = await undoProposal(offer.proposalId, (changed) => window.confirm(`You’ve edited ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ' and more' : ''} since. Undo anyway and lose those edits?`))
        toastNote(said, undefined, ID)
      }, ID)
    }
    window.addEventListener(UNDO_OFFER, on)
    return () => { window.removeEventListener(UNDO_OFFER, on); toastDismiss(ID) }
  }, [])
  return null
}
