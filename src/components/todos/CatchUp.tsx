'use client'

import { Tuck } from '@/components/ui/Tuck'
import { planCatchUp } from '@/lib/catch-up'
import { dayName } from '@/lib/catch-up-label'
import { useTodos } from '@/components/todos/TodosProvider'
import { useUndo } from '@/components/undo/UndoProvider'
import { BTN_PRIMARY, BTN_GHOST } from '@/components/ui/buttons'

/**
 * Missed days, without the guilt pile.
 *
 * Whatever slipped lands on today, so two off days become one impossible one. When three or more
 * have piled up, Tuck offers a lighter today: keep what fits, spread the rest over the days
 * ahead. One tap, and Undo puts every one back. Said as a fact and an offer, never as blame.
 */
export function CatchUp({ date, onAway }: { date: string; onAway: () => void }) {
  const { todos, lists, patch } = useTodos()
  const { record } = useUndo()
  const plan = planCatchUp(todos, date, lists)
  if (!plan || plan.moves.length === 0) return null

  const away = onAway
  const lighten = () => {
    const before = plan.moves.map((m) => {
      const t = todos.find((x) => x.id === m.id)!
      return { id: m.id, when: t.when, time: t.time, timePlanned: t.timePlanned }
    })
    for (const m of plan.moves) patch(m.id, { when: m.to, time: null, timePlanned: false })
    record(`Spread ${plan.moves.length} missed to-dos`, () => { for (const b of before) patch(b.id, { when: b.when, time: b.time, timePlanned: b.timePlanned }) })
    away()
  }
  const last = plan.moves[plan.moves.length - 1].to

  return (
    <section aria-label="Missed to-dos" className="mb-4 flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-card px-4 py-3 max-md:grid max-md:grid-cols-[3.5rem_1fr] max-md:items-center max-md:gap-x-3 max-md:gap-y-2">
      <Tuck state="idle" size={72} decorative className="shrink-0 max-md:!w-14 max-md:!h-auto max-md:aspect-[320/300]" />
      <div className="min-w-0 flex-1 max-md:contents">
        <p className="text-[length:calc(15px*var(--ts))] max-md:text-[length:calc(17px*var(--ts))] font-semibold leading-snug">Today’s a bit full. Want me to lighten it?</p>
        <p className="mt-0.5 text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))] max-md:col-span-2 text-muted-foreground">One missed day doesn’t change who you are. I can keep {plan.keep.length === 0 ? 'today light' : `${plan.keep.length} for today`} and spread the other {plan.moves.length} until {dayName(last, date)}.</p>
        <div className="mt-2.5 flex gap-2 max-md:col-span-2 max-md:mt-1">
          <button onClick={lighten} className={`${BTN_PRIMARY} max-md:flex-1`}>Lighten today</button>
          <button onClick={away} className={`${BTN_GHOST} max-md:flex-1`}>Keep it all</button>
        </div>
      </div>
    </section>
  )
}
