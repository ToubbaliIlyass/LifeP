'use client'

import { useEffect, useState } from 'react'

type Phase = 'init' | 'in' | 'merge' | 'hold' | 'out' | 'done'

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('init')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('in'),     50),
      setTimeout(() => setPhase('merge'),  600),
      setTimeout(() => setPhase('hold'),   1250),
      setTimeout(() => setPhase('out'),    1850),
      setTimeout(() => { setPhase('done'); onDone() }, 2600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  function skip() {
    setPhase('out')
    setTimeout(onDone, 750)
  }

  const merging = phase === 'merge' || phase === 'hold' || phase === 'out' || phase === 'done'

  // Overlay is always opaque so it covers the dashboard from the very first render.
  // Only the text inside fades in/out — the overlay itself only fades on exit.
  const overlayOpacity = phase === 'out' || phase === 'done' ? 0 : 1
  const overlayTransition = phase === 'out' ? 'opacity 0.9s ease' : 'none'

  const textOpacity = phase === 'init' ? 0 : phase === 'out' || phase === 'done' ? 0 : 1
  const textTransition = phase === 'in' ? 'opacity 0.5s cubic-bezier(0.4, 0, 0.6, 1)' : phase === 'out' ? 'opacity 0.4s ease' : 'none'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background cursor-pointer select-none"
      style={{
        opacity: overlayOpacity,
        transition: overlayTransition,
        pointerEvents: phase === 'done' ? 'none' : 'auto',
      }}
      onClick={skip}
      onKeyDown={(e) => ['Escape', ' ', 'Enter'].includes(e.key) && skip()}
      tabIndex={0}
    >
      <div
        className="flex items-baseline overflow-hidden"
        style={{ opacity: textOpacity, transition: textTransition }}
      >
        {/* "Where " — collapses on merge */}
        <span
          className="text-[48px] text-muted-foreground/50 overflow-hidden whitespace-nowrap"
          style={{
            maxWidth: merging ? '0px' : '280px',
            opacity: merging ? 0 : 1,
            transition: 'max-width 0.7s ease, opacity 0.45s ease',
          }}
        >
          Where&nbsp;
        </span>

        {/* "Act" — serif */}
        <span className="text-[48px] font-serif font-semibold text-foreground tracking-tight">
          Act
        </span>

        {/* "-ion meets struct-" — collapses on merge */}
        <span
          className="text-[48px] text-muted-foreground/50 overflow-hidden whitespace-nowrap"
          style={{
            maxWidth: merging ? '0px' : '700px',
            opacity: merging ? 0 : 1,
            transition: 'max-width 0.7s ease, opacity 0.45s ease',
          }}
        >
          -ion meets struct-
        </span>

        {/* "ure" — serif */}
        <span className="text-[48px] font-serif font-semibold text-foreground tracking-tight">
          ure
        </span>
      </div>
    </div>
  )
}
