import type { CSSProperties } from 'react'
import { typeVarRef } from '@/lib/colors'

/**
 * A node's colour, read off the container.
 *
 * The circles used to carry Tailwind colour classes — `bg-sky-300/80` and a
 * matching `dark:` twin, twelve times over — which meant the colour of a
 * Task lived in twelve places and could not be chosen by anyone. Now
 * GraphView publishes one set of custom properties per type (src/lib/colors.ts)
 * and every circle just names the type it is.
 *
 * The fallbacks are the neutral look, for a type nobody has given a colour
 * and for the first frame before settings arrive.
 */

const NEUTRAL_FILL = 'color-mix(in oklch, var(--muted) 70%, transparent)'
const NEUTRAL_SOFT = 'color-mix(in oklch, var(--muted) 45%, transparent)'
const NEUTRAL_EDGE = 'color-mix(in oklch, var(--border) 80%, transparent)'

/** A leaf circle: small, solid, with a faint halo. */
export function leafCircleStyle(type: string | undefined): CSSProperties {
  if (!type) return { background: NEUTRAL_FILL, borderColor: NEUTRAL_EDGE }
  return {
    background: typeVarRef(type, 'fill', NEUTRAL_FILL),
    borderColor: typeVarRef(type, 'border', NEUTRAL_EDGE),
    boxShadow: `0 0 6px ${typeVarRef(type, 'glow', 'transparent')}`,
  }
}

/** A category circle, which is bigger, quieter, and has a word inside it. */
export function categoryCircleStyle(type: string | undefined): CSSProperties {
  if (!type) return { background: NEUTRAL_SOFT, borderColor: NEUTRAL_EDGE }
  const glow = typeVarRef(type, 'glow', 'transparent')
  return {
    background: typeVarRef(type, 'soft', NEUTRAL_SOFT),
    borderColor: typeVarRef(type, 'border', NEUTRAL_EDGE),
    boxShadow: `0 0 0 3px ${glow}, 0 0 10px ${glow}`,
  }
}

/** The word inside that circle. Dark enough to read on `soft`, either mode. */
export function categoryTextStyle(type: string | undefined): CSSProperties {
  return { color: type ? typeVarRef(type, 'text', 'var(--muted-foreground)') : 'var(--muted-foreground)' }
}
