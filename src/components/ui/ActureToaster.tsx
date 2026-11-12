'use client'

import { useEffect, useState } from 'react'
import { Toaster } from 'sileo'
import type { SileoPosition } from 'sileo'

/**
 * Every toast in the app: one "island" pill, in the palette's own colours, that grows to show the
 * detail and the way back (Undo), built on Sileo. The look lives in
 * `.acture-island` in globals.css.
 *
 * On a phone it drops from the top, clear of the bottom controls and under
 * the notch; on a wide screen it rises from the bottom, centred on the
 * content rather than the window so it never sits over the sidebar.
 */
export function ActureToaster() {
  const [position, setPosition] = useState<SileoPosition>('bottom-center')

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setPosition(mq.matches ? 'top-center' : 'bottom-center')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <div className="acture-island">
      <Toaster
        position={position}
        offset={{ top: 'calc(env(safe-area-inset-top) + 4px)', bottom: 24 }}
        options={{ fill: 'var(--island-bg)', roundness: 20 }}
      />
    </div>
  )
}
