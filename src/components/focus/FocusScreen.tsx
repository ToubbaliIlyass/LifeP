'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pause, Play, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { clockText, firstStart, focusedMs, isRunning, spentText } from '@/lib/focus'
import type { Todo } from '@/lib/todos'

/** 9:12, in the device's own style of clock. */
const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * Focus, as a screen to leave propped up: the to-do, and how long you have
 * been at it, big enough to read from across a desk. It keeps the screen
 * awake while the timer runs. It wears the theme (light or dark, any palette),
 * and closing it leaves the timer running: the strip on the list says so.
 */
export function FocusScreen({ todo, leaving, onPause, onResume, onFinish, onClose }: {
  todo: Todo
  /** On its way out (see Presence). */
  leaving: boolean
  onPause: () => void
  onResume: () => void
  onFinish: () => void
  onClose: () => void
}) {
  const sessions = todo.sessions ?? []
  const running = isRunning(sessions)
  const [now, setNow] = useState(() => Date.now())

  // The numbers come from the moments, so a sleeping phone or a hidden tab catches up the instant it is looked at.
  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [running])

  // Keep the screen on while it counts. The browser lets go of it whenever the page is hidden, so ask again on return.
  useEffect(() => {
    if (!running || leaving || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let gone = false
    const get = () => { navigator.wakeLock.request('screen').then((l) => { if (gone) l.release().catch(() => {}); else lock = l }).catch(() => { /* low battery, or not allowed: the clock still counts */ }) }
    const back = () => { if (document.visibilityState === 'visible') get() }
    get()
    document.addEventListener('visibilitychange', back)
    return () => { gone = true; document.removeEventListener('visibilitychange', back); lock?.release().catch(() => {}) }
  }, [running, leaving])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null
  const total = focusedMs(sessions, running ? now : Date.parse(sessions[sessions.length - 1]?.end ?? new Date().toISOString()))
  const began = firstStart(sessions)

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Focus" data-state={leaving ? 'closed' : 'open'} className="acture-sheet !bg-background !backdrop-filter-none fixed inset-0 z-[70] flex flex-col items-center text-foreground">
      <div className="flex w-full shrink-0 justify-end px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close (Esc). The timer keeps running" title="Close (Esc). The timer keeps running" className="grid h-11 w-11 place-items-center rounded-full bg-foreground/[0.08] text-muted-foreground transition hover:bg-foreground/[0.12] hover:text-foreground active:scale-95"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col items-center justify-center gap-[clamp(10px,2.5dvh,28px)] px-6 text-center lg:max-w-5xl">
        <Tuck state={running ? 'focus' : 'break-time'} size={400} decorative className="!w-auto !h-[clamp(96px,24dvh,260px)] max-w-[70vw] aspect-[320/300]" />
        <h2 className="max-w-full line-clamp-3 text-[length:calc(22px*var(--ts))] lg:text-[length:calc(30px*var(--ts))] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">{todo.title.trim() || 'New to-do'}</h2>
        <div role="timer" aria-live="off" className={`text-[clamp(60px,min(19vw,27dvh),230px)] font-bold leading-none tracking-[-0.04em] tabular-nums transition-opacity duration-300 ${running ? '' : 'opacity-50'}`}>{clockText(total)}</div>
        <p className="min-h-6 text-[length:calc(15px*var(--ts))] lg:text-[length:calc(19px*var(--ts))] text-muted-foreground">
          {running
            ? began && `Started ${at(began)}`
            : `Paused. ${spentText(total).replace(/^./, (c) => c.toUpperCase())} so far.`}
        </p>
      </div>

      <div className="flex w-full max-w-xl shrink-0 gap-3 px-6 lg:max-w-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button onClick={running ? onPause : onResume} className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-full bg-foreground/[0.08] text-[length:calc(16px*var(--ts))] font-bold transition hover:bg-foreground/[0.12] active:scale-[0.97]">
          {running ? <><Pause className="h-5 w-5" fill="currentColor" /> Pause</> : <><Play className="h-5 w-5" fill="currentColor" /> Resume</>}
        </button>
        <button onClick={onFinish} className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-full bg-primary text-[length:calc(16px*var(--ts))] font-bold text-primary-foreground shadow-lg transition hover:opacity-90 active:scale-[0.97]"><Check className="h-5 w-5" strokeWidth={3} /> Done</button>
      </div>
    </div>,
    document.body,
  )
}
