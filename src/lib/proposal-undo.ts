import { notifyDataChanged } from '@/lib/dataSignal'
import { clockZone } from '@/lib/wallclock'

/** Event the proposal queue sends when something was just added, so a toast can offer to take it back. */
export const UNDO_OFFER = 'acture:undo-offer'
export interface UndoOffer { proposalId: number; label: string }

export const offerUndo = (offer: UndoOffer) => window.dispatchEvent(new CustomEvent(UNDO_OFFER, { detail: offer }))

/**
 * Takes an approved proposal back out. Resolves to a sentence for the user:
 * what happened, or why it did not. When some of it has been edited since,
 * `ask` decides whether to throw those edits away.
 */
export async function undoProposal(proposalId: number, ask: (changed: string[]) => boolean | Promise<boolean>): Promise<string> {
  const call = (force: boolean) => fetch(`/api/proposals/${proposalId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force, tz: clockZone() }),
  })
  let res = await call(false).catch(() => null)
  if (res?.status === 409) {
    const d = (await res.json().catch(() => ({}))) as { changed?: string[]; error?: string }
    if (d.changed?.length) {
      if (!(await ask(d.changed))) return 'Left as it is.'
      res = await call(true).catch(() => null)
    } else {
      return d.error ?? 'That can’t be undone.'
    }
  }
  if (!res?.ok) return 'Could not undo that. Nothing was changed.'
  notifyDataChanged()
  return 'Taken back.'
}


/**
 * A proposal small and plain enough to just do, with Undo, instead of asking: up to three
 * to-dos or events and the links between them. Plans, areas, rearrangements, deletions
 * and changes to what exists all still wait for a yes.
 */
export function isSmallAddition(ops: { kind: string; type?: string; plan?: unknown; move?: unknown }[]): boolean {
  const creates = ops.filter((o) => o.kind === 'createNode')
  if (creates.length === 0 || creates.length > 3) return false
  return ops.every((o) => (o.kind === 'createNode' && ['Task', 'Event'].includes(o.type ?? '') && !o.plan) || (o.kind === 'createEdge' && !o.move))
}
