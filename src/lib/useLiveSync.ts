'use client'

import { useEffect, useRef } from 'react'

/** How often to ask while the app is on screen. */
const EVERY_MS = 5_000

/**
 * Keeps what is on screen in step with what is in the database, whichever
 * device changed it.
 *
 * Asks /api/sync for a fingerprint every few seconds while the page is
 * visible — and straight away when it comes back into view, regains focus or
 * comes back online — and calls `onChange` when the fingerprint moves. A
 * hidden tab asks nothing. The first answer only sets the baseline: what is
 * on screen was just loaded.
 */
export function useLiveSync(onChange: () => void) {
  const last = useRef<string | null>(null)
  const cb = useRef(onChange)
  useEffect(() => { cb.current = onChange }, [onChange])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false
    let stopped = false

    const check = async () => {
      if (inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try {
        const res = await fetch('/api/sync', { cache: 'no-store' })
        if (!res.ok) return
        const { v } = (await res.json()) as { v: string }
        if (last.current !== null && v !== last.current) cb.current()
        last.current = v
      } catch {
        /* offline: the next check, or coming back online, catches up */
      } finally {
        inFlight = false
      }
    }
    const loop = () => {
      if (stopped) return
      timer = setTimeout(async () => { await check(); loop() }, EVERY_MS)
    }
    const now = () => { void check() }

    void check()
    loop()
    document.addEventListener('visibilitychange', now)
    window.addEventListener('focus', now)
    window.addEventListener('online', now)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', now)
      window.removeEventListener('focus', now)
      window.removeEventListener('online', now)
    }
  }, [])
}
