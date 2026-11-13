'use client'

import { useEffect, useState } from 'react'
import { Pause } from 'lucide-react'
import { AnalogClock } from './AnalogClock'
import { clockText, focusedMs } from '@/lib/focus'
import { useFocus } from './useFocus'

/** The timer, while one runs and the focus screen is closed: what you are on and for how long. Tap to open it. */
export function FocusStrip() {
  const { running, open, pause } = useFocus()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  if (!running) return null
  return (
    <div className="mb-3 flex items-center gap-1 rounded-full bg-primary/10 pl-1 pr-1.5 max-md:mt-1">
      <button type="button" onClick={() => open(running.id)} aria-label={`Open focus: ${running.title}`} className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full px-3 text-left transition active:scale-[0.98]">
        <AnalogClock ms={focusedMs(running.sessions ?? [], now)} size={26} className="shrink-0 text-primary-ink" />
        <span className="min-w-0 flex-1 truncate text-[length:calc(14px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))] font-semibold">{running.title.trim() || 'New to-do'}</span>
        <span className="shrink-0 tabular-nums text-[length:calc(14px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))] font-bold">{clockText(focusedMs(running.sessions ?? [], now))}</span>
      </button>
      <button type="button" onClick={() => pause(running)} aria-label="Pause" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/80 transition hover:bg-foreground/[0.08] active:scale-90"><Pause className="h-4 w-4" fill="currentColor" /></button>
    </div>
  )
}
