/**
 * The maths behind a drag that feels like holding the thing (Apple's
 * "Designing Fluid Interfaces"): where a flick would come to rest, soft edges,
 * and the speed of the finger at the moment it lets go.
 */

/** How far a flick at `velocity` (px/s) would carry on, like scroll deceleration. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate)
}

/** Resistance past an edge: the further over, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const sign = overshoot < 0 ? -1 : 1
  const o = Math.abs(overshoot)
  return sign * (o * dimension * constant) / (dimension + constant * o)
}

export type Sample = { x: number; t: number }

/** px/s over the last `windowMs` of a drag, from its recent positions. */
export function velocityOf(history: Sample[], windowMs = 100): number {
  if (history.length < 2) return 0
  const end = history[history.length - 1]
  let start = history[0]
  for (const s of history) { if (end.t - s.t <= windowMs) { start = s; break } }
  const dt = end.t - start.t
  return dt > 0 ? ((end.x - start.x) / dt) * 1000 : 0
}

/**
 * Let go of a drawer at `x` (0 = open, -width = shut) moving at `velocity`:
 * it goes where the flick was heading, not just to the nearer side.
 */
export function drawerSettles(x: number, velocity: number, width: number): 'open' | 'closed' {
  return x + project(velocity) < -width / 2 ? 'closed' : 'open'
}
