'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pause, Play, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { firstStart, focusedMs, isRunning, spentText } from '@/lib/focus'
import { FlipClock } from './FlipClock'
import type { Todo } from '@/lib/todos'

/** How long untouched before the buttons fade away. */
const CALM_MS = 7000

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

  // Focusing is the screen going quiet: after a few seconds untouched, the buttons fade and only Tuck and the clock are left.
  // A touch (or a key) brings them back, and that first touch only wakes the screen, it does not press anything.
  const [quiet, setQuiet] = useState(false)
  const [stir, setStir] = useState(0)
  const lastStir = useRef(0)
  /** Until when a click is the tail of the tap that woke the screen, and must not press whatever is under it. */
  const swallowUntil = useRef(0)
  const calm = quiet && running && !leaving
  useEffect(() => {
    if (!running || leaving) return
    const t = setTimeout(() => setQuiet(true), CALM_MS)
    return () => clearTimeout(t)
  }, [running, leaving, stir])
  const wake = () => {
    const t = Date.now()
    if (!quiet && t - lastStir.current < 1000) return // a moving pointer is not worth a render a frame
    lastStir.current = t
    if (quiet) swallowUntil.current = t + 500
    setQuiet(false)
    setStir((n) => n + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null
  const total = focusedMs(sessions, running ? now : Date.parse(sessions[sessions.length - 1]?.end ?? new Date().toISOString()))
  const began = firstStart(sessions)

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Focus" data-state={leaving ? 'closed' : 'open'} onPointerDown={wake} onPointerMove={wake} onKeyDown={wake} onClickCapture={(e) => { if (Date.now() < swallowUntil.current) { e.stopPropagation(); e.preventDefault() } }} className="acture-sheet [animation-duration:0.2s] !bg-background !backdrop-filter-none fixed inset-0 z-[70] flex flex-col items-center overflow-hidden text-foreground">
      {/* While it counts, a warm light behind the clock; paused, it goes out. */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${running ? 'opacity-100' : 'opacity-0'}`} style={{ background: 'radial-gradient(70% 52% at 50% 52%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 72%), radial-gradient(120% 90% at 50% 50%, transparent 55%, color-mix(in oklab, var(--foreground) 7%, transparent))' }} />

      <div className="relative w-full shrink-0 px-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <p className="text-center text-[length:calc(13px*var(--ts))] lg:text-[length:calc(16px*var(--ts))] font-bold uppercase tracking-[0.22em] text-muted-foreground">Focusing on</p>
      </div>
      {/* The task, up top, where you read what you are doing. */}
      <h2 className={`relative mx-auto mt-1 max-w-3xl shrink-0 line-clamp-2 px-6 text-center text-[length:calc(25px*var(--ts))] lg:text-[length:calc(28px*var(--ts))] font-semibold leading-tight tracking-tight transition-opacity duration-1000 [overflow-wrap:anywhere] ${calm ? 'opacity-70' : ''}`}>{todo.title.trim() || 'New to-do'}</h2>

      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[clamp(8px,2dvh,24px)] px-6 text-center">
        <FlipClock ms={total} dim={!running} walking={running} walker={<Tuck state={running ? 'focus' : 'break-time'} size={500} decorative className="!h-full !w-full" />} />
        <p className="mt-1 min-h-6 text-[length:calc(15px*var(--ts))] lg:text-[length:calc(19px*var(--ts))] text-muted-foreground">
          {running
            ? began && `Started ${at(began)}`
            : `Paused. ${spentText(total).replace(/^./, (c) => c.toUpperCase())} so far.`}
        </p>
      </div>

      <div className={`relative flex w-full max-w-xl shrink-0 gap-3 px-6 lg:max-w-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] transition-opacity duration-700 ${calm ? 'pointer-events-none opacity-0' : ''}`}>
        <button onClick={onClose} tabIndex={calm ? -1 : 0} aria-label="Close (Esc). The timer keeps running" title="Close (Esc). The timer keeps running" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-muted-foreground transition hover:bg-foreground/[0.12] hover:text-foreground active:scale-95"><X className="h-5 w-5" /></button>
        <button onClick={running ? onPause : onResume} tabIndex={calm ? -1 : 0} className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-full bg-foreground/[0.08] text-[length:calc(16px*var(--ts))] font-bold transition hover:bg-foreground/[0.12] active:scale-[0.97]">
          {running ? <><Pause className="h-5 w-5" fill="currentColor" /> Pause</> : <><Play className="h-5 w-5" fill="currentColor" /> Resume</>}
        </button>
        <button onClick={onFinish} tabIndex={calm ? -1 : 0} className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-full bg-primary text-[length:calc(16px*var(--ts))] font-bold text-primary-foreground shadow-lg transition hover:opacity-90 active:scale-[0.97]"><Check className="h-5 w-5" strokeWidth={3} /> Done</button>
      </div>
    </div>,
    document.body,
  )
}
