'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface EventRow {
  id: number
  name: string
  date: string | null
  time: string | null
  duration: number | null
  location: string | null
  recurring: string
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

const RECURRING_LABELS: Record<string, string> = {
  daily: '↻ daily', weekly: '↻ weekly', monthly: '↻ monthly',
}

export function EventsPanel() {
  const [data, setData] = useState<EventsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/events?days=30')
      .then((r) => r.json())
      .then((d: EventsData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const grouped = data ? groupByDate(data.events) : new Map()

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-sm font-semibold">Upcoming Events</p>
        <p className="text-xs text-muted-foreground mt-0.5">Next 30 days</p>
      </div>
      <ScrollArea className="flex-1">
        {loading && <p className="text-sm text-muted-foreground text-center pt-8">Loading…</p>}
        {!loading && grouped.size === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8 px-4">
            No upcoming events — tell the AI about something on your calendar.
          </p>
        )}
        {!loading && grouped.size > 0 && (
          <div className="p-3 space-y-4">
            {[...grouped.entries()].map(([date, events]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">
                  {formatDate(date)}
                </p>
                <div className="space-y-1.5">
                  {events.map((e: EventRow) => (
                    <div key={e.id} className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{e.name}</p>
                        {e.recurring !== 'none' && (
                          <span className="text-[10px] text-amber-600 shrink-0">{RECURRING_LABELS[e.recurring] ?? e.recurring}</span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        {e.time && <span className="text-xs text-amber-600">{e.time}</span>}
                        {e.duration && <span className="text-xs text-amber-500">{e.duration}min</span>}
                        {e.location && <span className="text-xs text-amber-500">@ {e.location}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
