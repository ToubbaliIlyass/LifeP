'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTodos } from '@/components/todos/TodosProvider'
import { toastDismiss, toastStanding, toastTuck } from '@/lib/toast'
import { loadArt } from '@/lib/tuck/art'
import { wallNow } from '@/lib/wallclock'
import { dayFacts, momentFor, type Mood } from '@/lib/tuck/mood'
import { PROPOSAL_NEW, SAVE_FAILED, SAY, TICKED } from '@/lib/tuck/events'
import { progress } from '@/lib/todo-views'
import { useOnline } from '@/lib/tuck/useOnline'

/** A save quicker than this is not worth a mention. */
const SLOW_SAVE_MS = 900

type Said = Pick<Mood, 'state' | 'line'>

/** Counts worth a word: a first, then round numbers. Gains only, never a loss. */

/**
 * Tuck in the corner, saying what is happening behind the screen: a to-do
 * ticked, a proposal arrived, a save that is taking a while or did not
 * work, no connection.
 *
 * Quiet on purpose. A word of thanks stays for a few seconds and goes by
 * itself; "offline" and "saving" stay only as long as they are true; and
 * nothing here ever asks anything of you.
 */
export function TuckStatus({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const { todos, lists, events, saving } = useTodos()
  const online = useOnline()
  const [slow, setSlow] = useState(false)

  // The two poses that are needed exactly when the network is not: fetched now, while it is there.
  useEffect(() => {
    for (const state of ['offline', 'error'] as const) for (const dark of [false, true]) void loadArt(state, dark)
  }, [])

  // What the lists were just before a tick, for the word about it: events fire before the redraw.
  const latest = useRef({ todos, lists, events })
  useEffect(() => { latest.current = { todos, lists, events } })

  // One at a time: the newest replaces what was up (same id), so a run of ticks is not a queue.
  const say = useCallback((mood: Said, action?: { label: string; run: () => void; undo?: boolean }) => {
    toastTuck(mood.line, { pose: mood.state, action })
  }, [])

  useEffect(() => {
    const onTick = (e: Event) => {
      const { id, undo } = (e as CustomEvent<{ id: number; undo?: () => void }>).detail
      const { todos: before, lists: ls, events: ev } = latest.current
      const done = before.find((t) => t.id === id)
      if (!done) return
      const now = wallNow()
      const was = dayFacts({ now, todos: before, lists: ls, events: ev })
      const after = before.map((t) => (t.id === id ? { ...t, done: true, doneAt: new Date().toISOString() } : t))
      const is = dayFacts({ now, todos: after, lists: ls, events: ev })
      // The project this was the last open step of.
      const list = done.listId ? ls.find((l) => l.id === done.listId && !l.done) : undefined
      const finished = list && progress(list, before) < 1 && progress(list, after) === 1 ? list : null
      const m = momentFor(done, was, is, finished)
      if (m) say(m, undo && { label: 'Undo', run: undo, undo: true })
    }
    const onFail = () => say({ state: 'error', line: 'Oops, that didn’t work. Let’s try again.' })
    const onProposal = () => say({ state: 'curious', line: 'Ooh, something new showed up.' }, onNavigate ? { label: 'Take a look', run: () => onNavigate('proposals') } : undefined)
    const onSay = (e: Event) => say((e as CustomEvent<Said>).detail)
    window.addEventListener(SAY, onSay)
    window.addEventListener(TICKED, onTick)
    window.addEventListener(SAVE_FAILED, onFail)
    window.addEventListener(PROPOSAL_NEW, onProposal)
    return () => {
      window.removeEventListener(SAY, onSay)
      window.removeEventListener(TICKED, onTick)
      window.removeEventListener(SAVE_FAILED, onFail)
      window.removeEventListener(PROPOSAL_NEW, onProposal)
    }
  }, [say, onNavigate])

  // Saving shows only once it has taken a moment.
  useEffect(() => {
    if (!saving) { const off = setTimeout(() => setSlow(false), 0); return () => clearTimeout(off) }
    const on = setTimeout(() => setSlow(true), SLOW_SAVE_MS)
    return () => clearTimeout(on)
  }, [saving])

  // "Offline" and "saving" stay only as long as they are true.
  useEffect(() => {
    if (!online) { toastStanding('acture-offline', 'offline', 'Offline, but cosy. I’ll keep everything safe.'); return () => toastDismiss('acture-offline') }
  }, [online])
  useEffect(() => {
    if (online && slow) { toastStanding('acture-saving', 'syncing', 'Saving, one moment.'); return () => toastDismiss('acture-saving') }
  }, [online, slow])

  return null
}
