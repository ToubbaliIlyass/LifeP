'use client'

import { useEffect, useRef, useState } from 'react'
import type { WorldKind, WorldPayload } from '@/lib/identity'
import type { WorldScene } from './scene'

/**
 * Where the world is drawn. three.js comes in with scene.ts, imported only
 * once this mounts — the lists never pay for it.
 */
export function WorldCanvas({ kind, data, lookBack = 0, className = '' }: {
  kind: WorldKind
  data: WorldPayload
  /** The path only: how far back along it to stand, 0–1. */
  lookBack?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<WorldScene | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    let made: WorldScene | null = null
    import('./scene')
      .then(({ createWorldScene }) => {
        if (!alive || !canvasRef.current || !labelsRef.current) return
        made = createWorldScene(canvasRef.current, labelsRef.current)
        setScene(made)
      })
      // No WebGL (an old device, or it is switched off): the counts still tell the story.
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false; made?.dispose() }
  }, [])

  useEffect(() => { scene?.show(kind, data) }, [scene, kind, data])
  useEffect(() => { scene?.lookBack(lookBack) }, [scene, lookBack])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing" aria-hidden />
      <div ref={labelsRef} className="absolute inset-0 pointer-events-none" aria-hidden />
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-white/70">
          This device can’t draw the world, but every vote is still counted below.
        </p>
      )}
    </div>
  )
}
