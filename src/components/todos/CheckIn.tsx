'use client'

import { useEffect, useState } from 'react'
import { Keyboard, Mic, Moon, X } from 'lucide-react'
import { startListening, startTyping } from '@/components/today/TodayAssistant'
import { safeGet, safeSet } from '@/lib/storage'
import { wallNow } from '@/lib/wallclock'

/** What the assistant asks; it is also what is shown while it listens. */
const QUESTION = 'How did today go? What got done, when, and what didn’t?'
/** The day ends at midnight; this is when there is enough of it to look back on. */
const FROM = 20 * 60

/**
 * The evening check-in.
 *
 * Most of a day never passes through a checkbox, and what does is ticked
 * when it is remembered, not when it happened. So once a day, in the
 * evening, Acture asks — and two minutes of "gym at seven,
 * didn't get to the essay, the meeting ran long" is worth a week of clicks
 * to the planner. Answering, or "Not today", puts it away until tomorrow.
 */
export function CheckIn({ date }: { date: string }) {
  const key = `acture-checkin:${date}`
  const [now, setNow] = useState(() => wallNow())
  const [answered, setAnswered] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, so server and first client render agree
    setAnswered(safeGet('local', key) === '1')
    const id = setInterval(() => setNow(wallNow()), 60_000)
    return () => clearInterval(id)
  }, [key])

  const minutes = now.getHours() * 60 + now.getMinutes()
  if (answered || minutes < FROM) return null

  const close = () => { safeSet('local', key, '1'); setAnswered(true) }

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg bg-indigo-500/[0.08] dark:bg-indigo-400/[0.1] px-3.5 py-3">
      <Moon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">How did today go?</p>
        <p className="text-[13px] text-foreground/70">Tell Acture what you got done and when. It learns your days from this, and plans tomorrow better.</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <button onClick={() => { close(); startListening(QUESTION) }} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[13px] font-semibold hover:opacity-90">
            <Mic className="w-3.5 h-3.5" /> Tell it
          </button>
          <button onClick={() => { close(); startTyping(QUESTION) }} className="inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-[13px] font-medium hover:bg-foreground/[0.05]">
            <Keyboard className="w-3.5 h-3.5" /> Type it
          </button>
        </div>
      </div>
      <button onClick={close} title="Not today" aria-label="Not today" className="grid place-items-center w-6 h-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
