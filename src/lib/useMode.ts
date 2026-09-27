'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { applyMode, storedMode, type Mode } from '@/lib/themes'

/**
 * Light/dark mode, shared by every control that shows or changes it.
 *
 * There are two of those on screen at once — the sidebar button sits beside
 * the Settings picker — and they each used to keep their own copy of the
 * answer. Only one of them watched for changes, so pressing the sidebar
 * button left the Settings picker highlighting the mode you had just left.
 *
 * The fix is not a second observer but a single source: the `dark` class on
 * <html> is the truth, and every control reads it. Whoever writes it — the
 * pre-paint script, the other control, a settings load pulling a choice made
 * on another device — everyone follows, because nobody is remembering
 * anything of their own.
 */

/** The class is external state; a MutationObserver is how one subscribes to it. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const isDarkNow = () => document.documentElement.classList.contains('dark')
// There is no document during SSR, and no localStorage to consult either, so
// the server has to guess. React re-renders with the real value the moment it
// hydrates, which is a frame of a wrong *icon* at worst — the page's own
// colours were already settled by the pre-paint script in layout.tsx.
const isDarkOnServer = () => false

export interface ModeControl {
  /** What is on screen right now, with `system` already resolved. */
  dark: boolean
  /** Sets an explicit mode, everywhere, and remembers it. */
  set: (mode: Mode) => void
  /** Switches to the opposite of what is showing. */
  toggle: () => void
}

export function useMode(): ModeControl {
  const dark = useSyncExternalStore(subscribe, isDarkNow, isDarkOnServer)

  // Only matters while the mode is `system`: the OS flipping at sunset should
  // carry the page with it rather than waiting for a reload.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onPreference = () => { if (storedMode() === 'system') applyMode('system') }
    media.addEventListener('change', onPreference)
    return () => media.removeEventListener('change', onPreference)
  }, [])

  const set = useCallback((mode: Mode) => {
    // Writes the class, which is what every control is subscribed to — so
    // there is nothing else to notify.
    applyMode(mode)
    // Best effort, and deliberately not awaited: the mode is already applied
    // and stored locally, and this is only so a second device starts here.
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).catch(() => {})
  }, [])

  // Asking for the opposite of what you can see is a decision, so it always
  // produces an explicit mode and never falls back to `system`.
  const toggle = useCallback(() => { set(dark ? 'light' : 'dark') }, [dark, set])

  return { dark, set, toggle }
}
