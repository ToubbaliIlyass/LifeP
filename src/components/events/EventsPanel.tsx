'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MapPin, Pencil } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'

interface EventRow {
  id: number
  name: string
  date: string | null
  time: string | null
  duration: number | null
  location: string | null
  /** 'once' | 'daily' | 'weekdays' | 'weekly' */
  frequency: string
  daysOfWeek: number[] | null
  until: string | null
  recurring: boolean
}

interface EventsData {
  events: EventRow[]
  from: string
  days: number
}

function groupByDate(events: EventRow[]) {
  const map = new Map<string, EventRow[]>()
  for (const e of events) {
    if (!e.date) continue
    const group = map.get(e.date) ?? []
    group.push(e)
    map.set(e.date, group)
  }
  return map
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isToday(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  return d.getTime() === today.getTime()
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "↻ Tue, Thu" says more than "↻ weekly" for the same cost. */
function recurrenceLabel(e: EventRow): string | null {
  if (!e.recurring) return null
  if (e.frequency === 'weekly' && e.daysOfWeek?.length) {
    return `↻ ${e.daysOfWeek.map((d) => DOW_SHORT[d]).join(', ')}`
  }
  if (e.frequency === 'weekdays') return '↻ weekdays'
  if (e.frequency === 'daily') return '↻ daily'
  return `↻ ${e.frequency}`
}

export function EventsPanel() {
  const [data, setData] = useState<EventsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  function load() {
    fetch('/api/events?days=30')
      .then((r) => r.json())
      .then((d: EventsData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const grouped = data ? groupByDate(data.events) : new Map()

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); setSelectedId(null) }}
        />
      )}
      <ScrollArea className="flex-1">
        {loading && <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>}
        {!loading && grouped.size === 0 && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 px-5">
            No upcoming events — tell the AI about something on your calendar.
          </p>
        )}
        {!loading && grouped.size > 0 && (
          <div className="p-4 space-y-1">
            {[...grouped.entries()].map(([date, events], index) => {
              const today = isToday(date)
              return (
                <div key={date}>
                  {index > 0 && <div className="pt-4" />}
                  <div className={`border-l-2 pl-3 ${today ? 'border-amber-400/60' : 'border-border/30'}`}>
                    <p className={`text-[11px] font-medium uppercase tracking-widest mb-2 ${today ? 'text-amber-500/80 dark:text-amber-400/70' : 'text-muted-foreground/50'}`}>
                      {formatDate(date)}
                      <span className="font-mono font-normal ml-1.5 opacity-60 text-[10px]">· {events.length}</span>
                    </p>
                    <div className="space-y-1.5">
                      {events.map((e: EventRow) => (
                        <div key={`${e.id}-${e.date}`} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[13px] font-serif text-foreground/85 truncate">{e.name}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                {recurrenceLabel(e) && (
                                  <span className="text-[10px] font-mono text-muted-foreground/65">{recurrenceLabel(e)}</span>
                                )}
                                <button
                                  onClick={() => setSelectedId(e.id)}
                                  className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all"
                                  title="View / edit"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {(e.time || e.duration || e.location) && (
                              <div className="flex gap-2 mt-0.5 flex-wrap">
                                {e.time && <span className="text-[10px] font-mono text-muted-foreground/65">{e.time}</span>}
                                {e.duration && <span className="text-[10px] font-mono text-muted-foreground/65">{e.duration}min</span>}
                                {e.location && (
                                  <span className="text-[10px] text-muted-foreground/65 flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5" />{e.location}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
