'use client'

import { Keyboard, Mic, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { startListening, startTyping } from '@/components/today/TodayAssistant'
import { useTodos } from '@/components/todos/TodosProvider'
import { localDateStr } from '@/lib/date'
import { BTN_PRIMARY, BTN_GHOST } from '@/components/ui/buttons'

/** What the assistant asks; it is also what is shown while it listens. */
const QUESTION = 'How did today go? What got done, when, and what didn’t?'
/**
 * The evening check-in.
 *
 * Most of a day never passes through a checkbox, and what does is ticked
 * when it is remembered, not when it happened. So once a day, in the
 * evening, Acture asks — and two minutes of "gym at seven,
 * didn't get to the essay, the meeting ran long" is worth a week of clicks
 * to the planner. Answering, or "Not today", puts it away until tomorrow.
 */
export function CheckIn({ date, onAway }: { date: string; onAway: () => void }) {
  const { todos } = useTodos()

  // What got done today, so the evening starts with the good part.
  const doneToday = todos.filter((t) => t.done && t.doneAt && !t.prayerKey && localDateStr(new Date(t.doneAt)) === date).length

  const close = onAway

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg bg-indigo-500/[0.08] dark:bg-indigo-400/[0.1] pl-2 pr-3.5 py-2 max-md:grid max-md:grid-cols-[3.5rem_1fr_2.75rem] max-md:items-center max-md:gap-x-2 max-md:gap-y-2 max-md:rounded-2xl max-md:p-3">
      {/* Tuck with the lantern, looking back over the day with you. */}
      <Tuck state="evening-wrap" size={104} decorative className="max-md:!w-14 max-md:!h-auto max-md:aspect-[320/300]" />
      <div className="flex-1 min-w-0 py-1 max-md:contents">
        <p className="font-semibold max-md:text-[length:calc(17px*var(--ts))]">How did today go?</p>
        {doneToday > 0 && <p className="text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))] max-md:col-span-3 text-foreground/85">You finished <b className="font-semibold">{doneToday}</b> thing{doneToday === 1 ? '' : 's'} today. That counts.</p>}
        <p className="text-[length:calc(13px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))] max-md:col-span-3 text-foreground/70">Tell Tuck what you got done and when. It learns your days from this, and plans tomorrow better.</p>
        <div className="flex flex-wrap gap-1.5 mt-2 max-md:col-span-3 max-md:flex-nowrap max-md:gap-2 max-md:mt-0">
          <button onClick={() => { close(); startListening(QUESTION) }} className={`${BTN_PRIMARY} max-md:flex-1`}>
            <Mic className="w-3.5 h-3.5" /> Tell Tuck
          </button>
          <button onClick={() => { close(); startTyping(QUESTION) }} className={`${BTN_GHOST} max-md:flex-1`}>
            <Keyboard className="w-3.5 h-3.5" /> Type it
          </button>
        </div>
      </div>
      <button onClick={close} title="Not today" aria-label="Not today" className="grid place-items-center w-6 h-6 max-md:w-11 max-md:h-11 max-md:col-start-3 max-md:row-start-1 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
