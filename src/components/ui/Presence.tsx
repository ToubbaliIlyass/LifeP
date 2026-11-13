'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Keeps something on screen for a moment after it is told to go, so it can
 * leave the way it came (a sheet that fades in must fade out, not blink off).
 * `children` is given the state to draw: "open" while shown, "closed" while
 * leaving.
 */
export function Presence({ show, exitMs = 180, children }: {
  show: boolean
  exitMs?: number
  children: (state: 'open' | 'closed') => ReactNode
}) {
  const [prev, setPrev] = useState(show)
  const [leaving, setLeaving] = useState(false)

  // Seen during render rather than in an effect, so there is never a frame in between.
  if (prev !== show) { setPrev(show); setLeaving(!show) }

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(false), exitMs)
    return () => clearTimeout(t)
  }, [leaving, exitMs])

  if (show) return <>{children('open')}</>
  if (!leaving) return null
  return <>{children('closed')}</>
}
