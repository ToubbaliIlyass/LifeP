'use client'

import { useState } from 'react'
import { clockText } from '@/lib/focus'

/**
 * One card of a flip clock. When its text changes the top half folds down over
 * the bottom and the new one falls into place, as on a desk flip clock. Only
 * the card whose number changed moves, so a ticking second never touches the minutes.
 *
 * Four layers: the new top and the old bottom sit still; the old top (leaf) folds
 * away, then the new bottom (leaf) drops in. The look is in `.acture-flip` in globals.css.
 */
function FlipCard({ text, unit }: { text: string; unit: string }) {
  const [now, setNow] = useState({ cur: text, prev: text })
  // Seen during render, so the first frame of a change already has the old number to fold away.
  if (text !== now.cur) setNow({ cur: text, prev: now.cur })
  const flipping = now.cur !== now.prev
  return (
    <div className="acture-flip-cell">
      <div className="acture-flip" data-flipping={flipping || undefined}>
        <div className="acture-flip-half acture-flip-top"><span>{now.cur}</span></div>
        <div className="acture-flip-half acture-flip-bottom"><span data-old>{now.prev}</span><span data-new>{now.cur}</span></div>
        {flipping && (
          <>
            <div className="acture-flip-half acture-flip-top acture-flip-leaf acture-flip-leaf-top"><span>{now.prev}</span></div>
            <div className="acture-flip-half acture-flip-bottom acture-flip-leaf acture-flip-leaf-bottom" onAnimationEnd={(e) => { if (e.target === e.currentTarget) setNow((n) => ({ cur: n.cur, prev: n.cur })) }}><span>{now.cur}</span></div>
          </>
        )}
        <i aria-hidden className="acture-flip-hinge" />
      </div>
      <span aria-hidden className="acture-flip-caption">{unit}</span>
    </div>
  )
}

const two = (n: number) => String(n).padStart(2, '0')

/** Elapsed time as flip cards: minutes and seconds, with hours too once there are some. */
export function FlipClock({ ms, dim = false }: { ms: number; dim?: boolean }) {
  const s = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const cards = h > 0 ? 3 : 2
  return (
    <div role="timer" aria-live="off" style={{ '--n': cards } as React.CSSProperties} className={`acture-flip-clock transition-opacity duration-300 ${dim ? 'opacity-50' : ''}`}>
      <span className="sr-only">{clockText(ms)}</span>
      <div aria-hidden className="acture-flip-row">
        {h > 0 && <FlipCard text={String(h)} unit="hr" />}
        <FlipCard text={two(m)} unit="min" />
        <FlipCard text={two(sec)} unit="sec" />
      </div>
    </div>
  )
}
