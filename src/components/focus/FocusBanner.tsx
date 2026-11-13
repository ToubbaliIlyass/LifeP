'use client'

import { useEffect, useState } from 'react'
import { Check, Pause } from 'lucide-react'
import { AnalogClock } from './AnalogClock'
import { clockText, firstStart, focusedMs } from '@/lib/focus'
import type { Todo } from '@/lib/todos'
import { BTN_PRIMARY } from '@/components/ui/buttons'
import { useTodos } from '@/components/todos/TodosProvider'
import { suggestOrder, todayProgress } from '@/components/todos/WhatsNext'
import { useFocus } from './useFocus'

/** 9:12, in the device's own style of clock. */
const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * Today's "Now" card (WhatsNext) while a to-do is being timed: the same card, showing what you chose rather than
 * what is suggested: what you are on, how long you have been at it, Pause and Done. Tap it for the focus screen.
 * Along the bottom edge, the same thing as on the suggestion: how far through today's to-dos you are.
 */
export function FocusBanner({ todo, date }: { todo: Todo; date: string }) {
  const { todos, lists } = useTodos()
  const { open, pause, finish } = useFocus()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const ms = focusedMs(todo.sessions ?? [], now)
  const began = firstStart(todo.sessions ?? [])
  const { finished, total, pct } = todayProgress(todos, lists, date, suggestOrder(todos, date, 0, lists).length)
  return (
    <section
      aria-label="Focusing"
      className="mb-4 w-full overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.15] to-primary/[0.05] shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
    >
      <div className="flex items-center gap-3 px-4 py-3 max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-2.5 max-md:px-3">
        <button type="button" onClick={() => open(todo.id)} aria-label={`Open focus: ${todo.title}`} className="flex min-w-0 flex-1 items-center gap-3 text-left max-md:min-w-[calc(100%-1.5rem)]">
          <span className="relative grid shrink-0 place-items-center self-start">
            <AnalogClock ms={ms} size={30} className="text-primary-ink" />
            <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-primary ring-2 ring-background motion-reduce:animate-none" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[length:calc(16px*var(--ts))] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
              <span className="mr-2 text-[length:calc(12px*var(--ts))] font-semibold uppercase tracking-wider text-primary-ink max-md:text-[length:calc(11px*var(--ts))]">Focusing</span>
              {todo.title.trim() || 'Untitled'}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:calc(12.5px*var(--ts))] font-medium text-foreground/70">
              <span className="inline-flex items-center rounded-full bg-background/70 px-2 py-1 leading-none tabular-nums">{clockText(ms)}</span>
              {began && <span className="text-muted-foreground tabular-nums">Started {at(began)}</span>}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2 max-md:w-full">
          <button
            type="button"
            onClick={() => pause(todo)}
            aria-label="Pause"
            title="Pause"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-2.5 text-muted-foreground transition hover:bg-foreground/[0.07] hover:text-foreground active:scale-95 max-md:h-11 max-md:w-11 max-md:px-0"
          >
            <Pause className="h-4 w-4" fill="currentColor" />
          </button>
          <button type="button" onClick={() => finish(todo)} className={`${BTN_PRIMARY} shrink-0 max-md:flex-1`}>
            <Check className="h-4 w-4" strokeWidth={3} /> Done
          </button>
        </div>
      </div>
      <div role="progressbar" aria-label="Today's progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished} className="h-1 bg-primary/15">
        <div className="h-full rounded-r-full bg-primary transition-[width] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </section>
  )
}
