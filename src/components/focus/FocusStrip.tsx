'use client'

import { useEffect, useState } from 'react'
import { Check, Pause } from 'lucide-react'
import { AnalogClock } from './AnalogClock'
import { clockText, focusedMs } from '@/lib/focus'
import type { Todo } from '@/lib/todos'
import { useFocus } from './useFocus'

/**
 * A to-do being timed, as a banner: what you are on and for how long, with Pause and Done.
 * Tap it to open the focus screen. On a list it stands in the to-do's own place (see
 * TodoView), and where that to-do is not in view, FocusStrip shows it at the top instead.
 */
export function FocusBanner({ todo, className = '' }: { todo: Todo; className?: string }) {
  const { open, pause, finish } = useFocus()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const ms = focusedMs(todo.sessions ?? [], now)
  return (
    <div className={`flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-1 pr-1.5 ring-1 ring-primary/15 ${className}`}>
      <button type="button" onClick={() => open(todo.id)} aria-label={`Open focus: ${todo.title}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full pl-3 pr-2 text-left transition active:scale-[0.98]">
        <span className="relative grid shrink-0 place-items-center">
          <AnalogClock ms={ms} size={30} className="text-primary-ink" />
          <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-primary ring-2 ring-background motion-reduce:animate-none" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[length:calc(10.5px*var(--ts))] font-bold uppercase leading-none tracking-[0.14em] text-primary-ink/80">Focusing</span>
          <span className="mt-1 block truncate text-[length:calc(14.5px*var(--ts))] max-md:text-[length:calc(15.5px*var(--ts))] font-semibold leading-tight">{todo.title.trim() || 'New to-do'}</span>
        </span>
        <span className="shrink-0 tabular-nums text-[length:calc(19px*var(--ts))] font-bold tracking-tight">{clockText(ms)}</span>
      </button>
      <button type="button" onClick={() => pause(todo)} aria-label="Pause" title="Pause" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-ink transition hover:bg-primary/25 active:scale-90"><Pause className="h-4 w-4" fill="currentColor" /></button>
      <button type="button" onClick={() => finish(todo)} aria-label="Done" title="Done" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 active:scale-90"><Check className="h-[18px] w-[18px]" strokeWidth={3} /></button>
    </div>
  )
}

/** The timer at the top of a list, while one runs: hidden when its own banner is in the list (globals.css). */
export function FocusStrip() {
  const { running } = useFocus()
  if (!running) return null
  return <div data-focus-strip className="mb-3 max-md:mt-1"><FocusBanner todo={running} /></div>
}
