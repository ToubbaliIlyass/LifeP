'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTodos } from '@/components/todos/TodosProvider'
import { localDateStr } from '@/lib/date'
import { safeGet, safeSet } from '@/lib/storage'
import { wallNow } from '@/lib/wallclock'
import { dayFacts, daysSince, pickMood, type DayFacts, type Mood } from './mood'

const SEEN_KEY = 'acture-last-seen'
/** How long since the last visit, worked out once per page load: opening the app is what ends an absence. */
let away: number | null = null

function daysAwayOnLoad(today: string): number {
  if (away === null) {
    away = daysSince(safeGet('local', SEEN_KEY), today)
    safeSet('local', SEEN_KEY, today)
  }
  return away
}

/**
 * The pose and line for Today, from the clock and the day's to-dos (see
 * pickMood), plus the numbers it was picked from. The clock is re-read each
 * minute, so the morning gives way to the afternoon without a reload.
 */
export function useTuckMood(): { mood: Mood | null; facts: DayFacts } {
  const { ready, todos, lists, events } = useTodos()
  const [now, setNow] = useState(() => wallNow())
  useEffect(() => {
    const id = setInterval(() => setNow(wallNow()), 60_000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    const input = { now, todos, lists, events, daysAway: ready ? daysAwayOnLoad(localDateStr(now)) : 0 }
    return { mood: ready ? pickMood(input) : null, facts: dayFacts(input) }
  }, [ready, now, todos, lists, events])
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange) }
}

/** Whether this device has a connection, as the browser sees it. Always true on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}
