'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { addDays, todayStr } from '@/lib/date'
import type { DayLog as DayLogData, DayLogEntry } from '@/lib/day-log'

/**
 * A day, planned against what actually happened.
 *
 * The assistant logs what you tell it without saying so — the same as memory
 * — and this is the other half of that bargain: everything it recorded is
 * here, and anything it got wrong can be taken back. Only what happened is
 * listed on the right; moving and removing blocks are planning, not doing,
 * so they are left out.
 */

const SOURCE_LABEL: Partial<Record<DayLogEntry['source'], string>> = {
  reported: 'told',
  done: 'ticked',
}

function formatDay(date: string) {
  const today = todayStr()
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function DayLog() {
  const [date, setDate] = useState(todayStr())
  const [data, setData] = useState<DayLogData | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)

  const load = useCallback((d: string) => {
    fetch(`/api/day-log?date=${d}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((next: DayLogData | null) => { if (next) setData(next) })
      .catch(() => {})
  }, [])

  useEffect(() => { load(date) }, [date, load])

  async function remove(entry: DayLogEntry) {
    if (removing !== null) return
    setRemoving(entry.id)
    const res = await fetch(`/api/day-log?id=${entry.id}`, { method: 'DELETE' }).catch(() => null)
    setRemoving(null)
    if (res?.ok) setData((d) => d && { ...d, happened: d.happened.filter((h) => h.id !== entry.id) })
  }

  const happened = (data?.happened ?? []).filter((h) => h.source === 'reported' || h.source === 'done')
  const isToday = date === todayStr()

  return (
    <div className="mb-2 border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
        <p className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest">Day log</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate((d) => addDays(d, -1))}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Previous day"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-muted-foreground/70 w-24 text-center">{formatDay(date)}</span>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            disabled={isToday}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Next day"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {data && (
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/30">
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-2">Planned</p>
            {data.planned.length === 0 ? (
              <p className="text-[12px] italic text-muted-foreground/45">Nothing on the calendar.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.planned.map((p, i) => (
                  <li key={`${p.kind}-${p.start}-${i}`} className="flex items-baseline gap-2.5">
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/50 w-10 shrink-0">{p.start}</span>
                    <span className="text-[12px] text-foreground/70 truncate">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-2">What happened</p>
            {happened.length === 0 ? (
              <p className="text-[12px] italic text-muted-foreground/45 leading-relaxed">
                {isToday ? 'Nothing yet. Tick things off, or just tell the chat what you did.' : 'Nothing recorded.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {happened.map((h) => (
                  <li key={h.id} className="group flex items-baseline gap-2.5">
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/50 w-10 shrink-0">
                      {h.start ? `${h.approximate ? '~' : ''}${h.start}` : '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-foreground/80 truncate">{h.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground/45">
                        {SOURCE_LABEL[h.source]}
                        {h.itemType === 'Activity' && ' · not tracked yet'}
                        {h.plannedFor && ` · planned ${h.plannedFor}`}
                      </p>
                    </div>
                    {h.source === 'reported' && (
                      <button
                        onClick={() => remove(h)}
                        disabled={removing !== null}
                        title="Remove — the assistant got this wrong"
                        aria-label={`Remove ${h.name} from the log`}
                        className="shrink-0 p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
