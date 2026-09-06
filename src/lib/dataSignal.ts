'use client'

import { useEffect } from 'react'

/**
 * A one-line way for anything that changes data to say so.
 *
 * The Today badge counts tasks and habits that need attention, but the things
 * that change that count are scattered — the Today view, the task list, the
 * habit list, the Now queue, the detail panel, quick-add. Each one used to
 * reload only itself, so deleting or completing something left the badge
 * showing the old number until the next poll a minute later. That reads as a
 * stuck count, not a stale one.
 *
 * Threading a callback down through every panel would work until the next
 * mutation site forgot to call it. A module-level event has no such gap: the
 * emitter needs no knowledge of who is listening.
 */
const TOPIC = 'acture:data-changed'

/** Call after any write that could change what needs attention today. */
export function notifyDataChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TOPIC))
}

/** Run `callback` whenever anything writes. */
export function useDataChanged(callback: () => void) {
  useEffect(() => {
    window.addEventListener(TOPIC, callback)
    return () => window.removeEventListener(TOPIC, callback)
  }, [callback])
}
