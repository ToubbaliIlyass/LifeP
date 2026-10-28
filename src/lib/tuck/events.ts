/**
 * What the lists tell Tuck, as window events: nothing here is on the
 * critical path of saving, so a listener that is not mounted costs nothing.
 */

/** A to-do was just ticked off. `detail: { id }`, sent before the screen has redrawn. */
export const TICKED = 'acture:ticked'
/** A write did not reach the server. */
export const SAVE_FAILED = 'acture:save-failed'
/** A new proposal has arrived since the last look. */
export const PROPOSAL_NEW = 'acture:proposal-new'
/** Something worth a word from Tuck. `detail: { state, line }`: see TuckStatus. */
export const SAY = 'acture:tuck-say'
