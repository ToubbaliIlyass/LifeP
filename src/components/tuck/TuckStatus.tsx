'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTodos } from '@/components/todos/TodosProvider'
import { Tuck } from '@/components/ui/Tuck'
import { loadArt } from '@/lib/tuck/art'
import { wallNow } from '@/lib/wallclock'
import { dayFacts, momentFor, type Mood } from '@/lib/tuck/mood'
import { PROPOSAL_NEW, SAVE_FAILED, SAY, TICKED } from '@/lib/tuck/events'
import { progress } from '@/lib/todo-views'
import { useOnline } from '@/lib/tuck/useTuckMood'
import type { TuckState } from '@/lib/tuck/states'

/** How long a word of thanks stays up. */
const TOAST_MS = 3600
/** A save quicker than this is not worth a mention. */
const SLOW_SAVE_MS = 900

interface Toast { id: number; mood: Pick<Mood, 'state' | 'line'>; action?: { label: string; run: () => void } }

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
  const [toasts, setToasts] = useState<Toast[]>([])
  const [slow, setSlow] = useState(false)
  const seq = useRef(0)

  // The two poses that are needed exactly when the network is not: fetched now, while it is there.
  useEffect(() => {
    for (const state of ['offline', 'error'] as const) for (const dark of [false, true]) void loadArt(state, dark)
  }, [])

  // What the lists were just before a tick, for the word about it: events fire before the redraw.
  const latest = useRef({ todos, lists, events })
  useEffect(() => { latest.current = { todos, lists, events } })

  const say = useCallback((mood: Toast['mood'], action?: Toast['action']) => {
    const id = ++seq.current
    // One at a time: the newest replaces what was up, so a run of ticks is not a queue.
    setToasts([{ id, mood, action }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS)
  }, [])

  useEffect(() => {
    const onTick = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: number }>).detail
      const { todos: before, lists: ls, events: ev } = latest.current
      const done = before.find((t) => t.id === id)
      if (!done) return
      const now = wallNow()
      const was = dayFacts({ now, todos: before, lists: ls, events: ev, daysAway: 0 })
      const after = before.map((t) => (t.id === id ? { ...t, done: true, doneAt: new Date().toISOString() } : t))
      const is = dayFacts({ now, todos: after, lists: ls, events: ev, daysAway: 0 })
      // The project this was the last open step of.
      const list = done.listId ? ls.find((l) => l.id === done.listId && !l.done) : undefined
      const finished = list && progress(list, before) < 1 && progress(list, after) === 1 ? list : null
      const m = momentFor(done, was, is, finished)
      if (m) say(m)
    }
    const onFail = () => say({ state: 'error', line: 'Oops, that didn’t work. Let’s try again.' })
    const onProposal = () => say({ state: 'curious', line: 'Ooh, something new showed up.' }, onNavigate ? { label: 'Take a look', run: () => onNavigate('proposals') } : undefined)
    const onSay = (e: Event) => say((e as CustomEvent<Toast['mood']>).detail)
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

  const standing: { state: TuckState; line: string } | null = !online
    ? { state: 'offline', line: 'Offline, but cosy. I’ll keep everything safe.' }
    : slow ? { state: 'syncing', line: 'Saving, one moment.' } : null

  if (!standing && toasts.length === 0) return null
  const shown = standing ?? toasts[0].mood
  const action = standing ? undefined : toasts[0].action

  return (
    <div
      role="status"
      aria-live="polite"
      data-tuck-status={shown.state}
      className="pointer-events-none fixed z-[45] top-2 inset-x-0 md:left-[240px] flex justify-center px-3"
    >
      <div className="pointer-events-auto flex max-w-[360px] items-center gap-1.5 rounded-2xl border border-border/70 bg-card pl-1 pr-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_28px_rgb(0_0_0/0.14)]">
        <Tuck state={shown.state} size={52} decorative />
        <div className="min-w-0 py-1">
          <p className="text-[13.5px] leading-snug">{shown.line}</p>
          {action && (
            <button onClick={action.run} className="mt-0.5 text-[12.5px] font-semibold underline underline-offset-2 text-foreground/85 hover:text-foreground">
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
