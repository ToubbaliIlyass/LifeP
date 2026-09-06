'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Check, X } from 'lucide-react'
import { safeGet, safeSet } from '@/lib/storage'
import { todayStr } from '@/lib/date'

interface Suggestion {
  taskId: number
  name: string
  startTime: string
  endTime: string
  minutes: number
  reason: string
}

/**
 * The morning plan: what the app would schedule today, offered rather than
 * imposed.
 *
 * Nothing here has touched the calendar yet. Each row can be dropped before
 * accepting, so the choice is which parts of the plan are right — not all of
 * it or none.
 *
 * Dismissing is remembered per day, so declining in the morning does not mean
 * being asked again every time the dashboard is opened.
 */
export function ScheduleSuggestions({ onScheduled }: { onScheduled?: () => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [rejected, setRejected] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)
  const [dismissed, setDismissed] = useState(true) // assume hidden until we know otherwise
  const [date, setDate] = useState(todayStr())

  const dismissKey = `acture-schedule-dismissed:${date}`

  const load = useCallback(() => {
    fetch('/api/schedule/suggestions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { date: string; suggestions: Suggestion[] } | null) => {
        if (!d) return
        setDate(d.date)
        setSuggestions(d.suggestions ?? [])
        setDismissed(safeGet('local', `acture-schedule-dismissed:${d.date}`) === '1')
      })
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const accepted = suggestions.filter((s) => !rejected.has(s.taskId))

  async function apply() {
    if (accepted.length === 0) return
    setApplying(true)
    // The exact times shown are sent back, so what gets written is what was
    // approved rather than a fresh plan computed a minute later.
    await fetch('/api/schedule/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        placements: accepted.map(({ taskId, startTime, endTime }) => ({ taskId, startTime, endTime })),
      }),
    })
    setApplying(false)
    setSuggestions([])
    onScheduled?.()
  }

  function dismiss() {
    safeSet('local', dismissKey, '1')
    setDismissed(true)
  }

  if (dismissed || suggestions.length === 0) return null

  return (
    <section className="mb-8 rounded-xl border border-primary/30 bg-primary/[0.05] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-primary/20">
        <CalendarClock className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-serif text-foreground/90">
            {suggestions.length} {suggestions.length === 1 ? 'task needs' : 'tasks need'} a time today
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            Suggested around what's already on your calendar. Nothing is scheduled until you accept.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Not today"
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-border/30">
        {suggestions.map((s) => {
          const dropped = rejected.has(s.taskId)
          return (
            <div key={s.taskId} className={`flex items-center gap-3 px-4 py-2.5 ${dropped ? 'opacity-40' : ''}`}>
              <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums shrink-0 w-24">
                {s.startTime}–{s.endTime}
              </span>
              <span className={`text-[13px] font-serif flex-1 truncate ${dropped ? 'line-through text-muted-foreground/60' : 'text-foreground/85'}`}>
                {s.name}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0 hidden sm:inline">
                {s.reason}
              </span>
              <button
                onClick={() =>
                  setRejected((prev) => {
                    const next = new Set(prev)
                    if (next.has(s.taskId)) next.delete(s.taskId)
                    else next.add(s.taskId)
                    return next
                  })
                }
                aria-label={dropped ? `Put ${s.name} back` : `Remove ${s.name} from the plan`}
                className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
              >
                {dropped ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-primary/20">
        <button
          onClick={apply}
          disabled={applying || accepted.length === 0}
          className="text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {applying
            ? 'Scheduling…'
            : accepted.length === suggestions.length
              ? 'Add all to calendar'
              : `Add ${accepted.length} to calendar`}
        </button>
        <button
          onClick={dismiss}
          className="text-[12px] font-medium px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
        >
          Not today
        </button>
      </div>
    </section>
  )
}
