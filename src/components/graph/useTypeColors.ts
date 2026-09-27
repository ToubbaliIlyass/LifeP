'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { TypeColors } from '@/lib/colors'

/**
 * The user's per-type hues, shared by everything that draws a node.
 *
 * One store rather than a fetch per view: the graph, the calendar and the
 * settings preview can all be mounted at once, and they must never disagree
 * about what colour a Task is. It lives next to the graph because that is
 * where node colour is decided; the calendar imports it for the same reason
 * it already imports NodeDetailPanel from here.
 *
 * Settings are read once and then only ever written — the colour picker
 * calls `publishTypeColors` after saving, so both views repaint on the same
 * frame instead of on the next reload.
 */

/** A stable empty map, so a re-render before the fetch lands is not a change. */
const NONE: TypeColors = {}

let cache: TypeColors = NONE
let loading: Promise<void> | null = null
/** Set once colours have been saved, so a slow first read cannot undo them. */
let published = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Announces colours that have just been saved. */
export function publishTypeColors(next: TypeColors) {
  cache = next
  published = true
  emit()
}

function load() {
  loading ??= fetch('/api/settings')
    .then((r) => r.json())
    .then(({ settings }: { settings?: { typeColors?: TypeColors } }) => {
      if (published) return
      // Absent is the normal case for a new account: every type then falls
      // back to the defaults in src/lib/colors.ts.
      cache = settings?.typeColors ?? NONE
      emit()
    })
    .catch(() => {
      // A failed read is not worth surfacing: the defaults are what the app
      // looked like before any of this existed.
    })
  return loading
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

export function useTypeColors(): TypeColors {
  useEffect(() => { void load() }, [])
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => NONE,
  )
}
