/**
 * The one look for buttons, so the same kind of button is the same everywhere.
 *
 * - Primary: the one thing to do in a place (Done, Add, Undo, Tell Tuck). A pill in the theme colour.
 * - Ghost: the quiet alternative beside it (Not now, Cancel). The same pill, no fill colour.
 * Both are 40px tall on a large screen and 44px on a phone, with the same type and the same press.
 * Place them with extra classes (flex-1, shrink-0, a margin); do not restyle them.
 */
const BASE =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[length:calc(14.5px*var(--ts))] font-semibold transition active:scale-[0.97] disabled:opacity-40 max-md:h-11 max-md:text-[length:calc(16px*var(--ts))]'

export const BTN_PRIMARY = `${BASE} bg-primary text-primary-foreground hover:opacity-90 disabled:bg-foreground/[0.1] disabled:text-muted-foreground disabled:opacity-100`
export const BTN_GHOST = `${BASE} bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/[0.1] hover:text-foreground`
