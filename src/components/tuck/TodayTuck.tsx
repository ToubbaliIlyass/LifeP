'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { startTyping } from '@/components/today/TodayAssistant'
import { useTodos } from '@/components/todos/TodosProvider'
import { Tuck } from '@/components/ui/Tuck'
import { safeGet, safeSet } from '@/lib/storage'
import type { Mood } from '@/lib/tuck/mood'
import { useTuckMood } from '@/lib/tuck/useTuckMood'

/**
 * Tuck at the top of Today: one pose, one line, picked from the time of day
 * and how the day is going (src/lib/tuck/mood.ts).
 *
 * Most of the time there is nothing to say and this is not on the screen.
 * When it is, it is one card — never a stack — and putting it away keeps it
 * away for the rest of that day, as the evening check-in does. A heavy day
 * or a long absence gets kindness and a place to start, never a count of
 * what was missed.
 */
export function TodayTuck() {
  const { date, todos } = useTodos()
  const { mood, facts } = useTuckMood()
  // A putaway is remembered per day and per mood, so the next mood is not hidden by it.
  const key = mood ? `acture-tuck:${date}:${mood.key}` : null
  const [away, setAway] = useState<string | null>(null)
  if (!mood || !key || away === key || safeGet('local', key) === '1') return null

  const close = () => { safeSet('local', key, '1'); setAway(key) }
  const act = (m: Mood) => {
    if (!m.action) return
    close()
    if (m.action.kind === 'break-down') {
      const t = todos.find((x) => x.id === m.action?.todoId)
      startTyping(`What is the first small step for “${t?.title || 'this'}”?`)
    } else {
      startTyping('Tell me what matters most today, and I’ll sort the rest.')
    }
  }

  return (
    <div role="status" data-tuck-card={mood.state} className="mb-5 flex items-center gap-3 rounded-xl bg-foreground/[0.045] pl-3 pr-3 py-3">
      {/* Growth shows on the sprout: a seed at first, a bloom after a hundred. */}
      <Tuck state={mood.state} size={124} decorative level={facts.level === 'sprout' ? null : facts.level} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] leading-snug">{mood.line}</p>
        {mood.action && (
          <button onClick={() => act(mood)} className="mt-1.5 inline-flex items-center rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[13px] font-semibold hover:opacity-90">
            {mood.action.label}
          </button>
        )}
      </div>
      <button onClick={close} title="Not now" aria-label="Not now" className="self-start grid place-items-center w-6 h-6 mt-1 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
