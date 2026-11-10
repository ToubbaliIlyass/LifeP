'use client'

import { Mic } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { startListening } from '@/components/today/TodayAssistant'
import { useTodos } from '@/components/todos/TodosProvider'
import { lookBack, weekLine } from '@/lib/week-reflection'
import { BTN_PRIMARY, BTN_GHOST } from '@/components/ui/buttons'

/**
 * The week, looked back on, once a week.
 *
 * From Sunday afternoon to Monday, Tuck says how the last seven days went in plain counts
 * (what got done, on how many days, where the most went), never what was missed, and offers
 * to plan the next. Put away for the week with one tap.
 */
export function WeekReflection({ date, onAway }: { date: string; onAway: () => void }) {
  const { todos, lists } = useTodos()
  const w = lookBack(todos, lists, date)
  const away = onAway
  const facts = [
    w.done > 0 ? `${w.done} done` : null,
    w.activeDays > 0 ? `${w.activeDays} of 7 days` : null,
    w.busiest ? `busiest: ${w.busiest}` : null,
    w.topList ? `most in ${w.topList}` : null,
  ].filter(Boolean)

  return (
    <section aria-label="Your week" className="mb-4 flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-card px-4 py-3 max-md:grid max-md:grid-cols-[3.5rem_1fr] max-md:items-center max-md:gap-x-3 max-md:gap-y-2">
      <Tuck state={w.done >= 5 ? 'celebrating' : 'idle'} size={96} decorative className="shrink-0 max-md:!w-14 max-md:!h-auto max-md:aspect-[320/300]" />
      <div className="min-w-0 flex-1 max-md:contents">
        <p className="text-[length:calc(11.5px*var(--ts))] font-semibold uppercase tracking-wider text-muted-foreground">Your week</p>
        <p className="text-[length:calc(16px*var(--ts))] max-md:text-[length:calc(17px*var(--ts))] max-md:col-span-2 font-semibold leading-snug">{weekLine(w)}</p>
        {facts.length > 0 && <p className="mt-0.5 text-[length:calc(13px*var(--ts))] max-md:text-[length:calc(14.5px*var(--ts))] max-md:col-span-2 text-muted-foreground">{facts.join(' · ')}</p>}
        <div className="mt-2.5 flex gap-2 max-md:col-span-2 max-md:mt-1">
          <button onClick={() => { away(); startListening('What do you want to get done next week?') }} className={`${BTN_PRIMARY} max-md:flex-1`}><Mic className="h-3.5 w-3.5" /> Plan next week</button>
          <button onClick={away} className={`${BTN_GHOST} max-md:flex-1`}>Thanks</button>
        </div>
      </div>
    </section>
  )
}
