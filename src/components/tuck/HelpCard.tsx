'use client'

import { X } from 'lucide-react'
import { startTyping } from '@/components/today/TodayAssistant'
import { useTodos } from '@/components/todos/TodosProvider'
import { Tuck } from '@/components/ui/Tuck'
import type { Mood, DayFacts } from '@/lib/tuck/mood'
import { BTN_PRIMARY } from '@/components/ui/buttons'

/**
 * Tuck offering help with one to-do that has sat for a week. One of the
 * cards in src/lib/today-card.ts, shown only when nothing else is.
 * A heavy day or a long absence gets kindness and a place to start, never a
 * count of what was missed.
 */
export function HelpCard({ mood, level, onAway }: { mood: Mood; level: DayFacts['level']; onAway: () => void }) {
  const { todos } = useTodos()
  const act = (m: Mood) => {
    if (!m.action) return
    onAway()
    const t = todos.find((x) => x.id === m.action?.todoId)
    startTyping(`What is the first small step for “${t?.title || 'this'}”?`)
  }

  return (
    <div role="status" data-tuck-card={mood.state} className="mb-5 flex items-center gap-3 rounded-xl bg-foreground/[0.045] pl-3 pr-3 py-3 max-md:grid max-md:grid-cols-[3.5rem_1fr_2.75rem] max-md:gap-x-2 max-md:gap-y-2 max-md:rounded-2xl">
      {/* Growth shows on the sprout: a seed at first, a bloom after a hundred. */}
      <Tuck state={mood.state} size={160} decorative level={level === 'sprout' ? null : level} className="shrink-0 max-md:!w-14 max-md:!h-auto max-md:aspect-[320/300]" />
      <div className="flex-1 min-w-0 max-md:contents">
        <p className="text-[length:calc(15px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] leading-snug">{mood.line}</p>
        {mood.action && (
          <button onClick={() => act(mood)} className={`${BTN_PRIMARY} mt-1.5 max-md:col-span-3 max-md:mt-0`}>
            {mood.action.label}
          </button>
        )}
      </div>
      <button onClick={onAway} title="Not now" aria-label="Not now" className="self-start grid place-items-center w-6 h-6 max-md:w-11 max-md:h-11 max-md:col-start-3 max-md:row-start-1 mt-1 max-md:mt-0 max-md:self-center shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
