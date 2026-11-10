'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { IDENTITY_COLORS, identityForTodo, type IdentityStats } from '@/lib/identity'
import { useDataChanged } from '@/lib/dataSignal'
import { clockZone } from '@/lib/wallclock'

/**
 * The user's identities with their counts, held once for the whole app so the
 * places that show them (a tick's "+1", the dot on a to-do, the evening
 * check-in) cost one request between them, not one each. Refreshed whenever
 * anything is written; a tick bumps its count at once, before the server has
 * counted again.
 */
interface State { identities: IdentityStats[]; today: string | null; loaded: boolean }
let state: State = { identities: [], today: null, loaded: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let inFlight = false

async function refresh() {
  if (inFlight) return
  inFlight = true
  try {
    const tz = clockZone()
    const res = await fetch(`/api/identities${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`)
    if (res.ok) {
      const d = (await res.json()) as { identities: IdentityStats[]; today: string }
      state = { identities: d.identities, today: d.today, loaded: true }
      emit()
    }
  } catch { /* offline: what is held stays */ }
  inFlight = false
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => state
// One object, always the same one: React compares the server snapshot by identity.
const SERVER: State = { identities: [], today: null, loaded: false }
const server = () => SERVER

/** One more vote for this identity, shown now. */
export function bumpIdentity(id: number) {
  state = { ...state, identities: state.identities.map((i) => (i.id === id ? { ...i, votes: i.votes + 1, week: i.week + 1 } : i)) }
  emit()
}

/** The current identities, without asking the server (for code that runs on an event). */
export const currentIdentities = () => state.identities

export const identityColor = (idt: Pick<IdentityStats, 'hue'>) => IDENTITY_COLORS[idt.hue % IDENTITY_COLORS.length]

export function useIdentities() {
  const s = useSyncExternalStore(subscribe, snapshot, server)
  useEffect(() => { if (!state.loaded) void refresh() }, [])
  useDataChanged(refresh)
  return {
    ...s,
    /** Which identity a to-do on the screen votes for, if any, with its colour. */
    forTodo: (todo: { id: number; listId: number | null; tags: string[] }, lists: { id: number; areaId: number | null }[]) => {
      const idt = identityForTodo(todo, lists, s.identities)
      const full = idt ? s.identities.find((i) => i.id === idt.id) : undefined
      return full ? { identity: full, color: identityColor(full) } : null
    },
  }
}
