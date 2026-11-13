'use client'

import { useState } from 'react'
import { focusedMs, isRunning, spentText, type FocusSession } from '@/lib/focus'

const SHOWN = 5
const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dayOf = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })

/** What the timer recorded on a to-do: when it was started, paused, resumed and stopped, and the total. */
export function FocusLog({ sessions }: { sessions: FocusSession[] }) {
  // As of when it was opened: a log, not a clock (the focus screen is the clock).
  const [now] = useState(() => Date.now())
  const running = isRunning(sessions)
  const total = focusedMs(sessions, now)
  const shown = sessions.slice(-SHOWN)
  const today = new Date(now).toDateString()
  return (
    <div className="mt-3 rounded-lg bg-foreground/[0.04] px-3 py-2.5 text-[length:calc(12.5px*var(--ts))] max-md:text-[length:calc(14px*var(--ts))] text-muted-foreground">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-semibold text-foreground/80">Focus</span>
        <span className="tabular-nums">{spentText(total)}{running ? ' so far' : ' in all'}</span>
      </div>
      {sessions.length > SHOWN && <div className="mb-0.5 text-muted-foreground/70">{sessions.length - SHOWN} earlier</div>}
      <ul className="space-y-0.5 tabular-nums">
        {shown.map((s) => (
          <li key={s.start} className="flex justify-between gap-2">
            <span>
              {new Date(s.start).toDateString() !== today && <span className="mr-1.5 text-muted-foreground/70">{dayOf(s.start)}</span>}
              {at(s.start)} to {s.end ? at(s.end) : 'now'}
            </span>
            <span>{s.end ? spentText(Date.parse(s.end) - Date.parse(s.start)) : 'running'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
