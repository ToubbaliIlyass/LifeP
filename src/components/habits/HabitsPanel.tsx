'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pencil } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'

interface HabitRow {
  id: number
  name: string
  frequency: string
  daysOfWeek: number[] | null
  durationMinutes: number | null
  todayCompleted: boolean
  streak: number
}

interface HabitsData {
  habits: HabitRow[]
  date: string
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const FREQ_GROUPS: { key: string; label: string; borderClass: string; labelClass: string }[] = [
  { key: 'daily',    label: 'Daily',    borderClass: 'border-primary/30',          labelClass: 'text-foreground/60' },
  { key: 'weekdays', label: 'Weekdays', borderClass: 'border-sky-400/30',           labelClass: 'text-sky-500/70 dark:text-sky-400/60' },
  { key: 'weekly',   label: 'Weekly',   borderClass: 'border-violet-400/30',        labelClass: 'text-violet-500/70 dark:text-violet-400/60' },
]

function habitSubLabel(habit: HabitRow): string {
  const parts: string[] = []
  if (habit.frequency === 'weekdays') {
    parts.push('Mon – Fri')
  } else if (habit.frequency === 'weekly' && habit.daysOfWeek?.length) {
    parts.push(habit.daysOfWeek.map((d) => DOW_LABELS[d]).join(', '))
  }
  if (habit.durationMinutes) parts.push(`${habit.durationMinutes}min`)
  return parts.join(' · ')
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export function HabitsPanel() {
  const [data, setData] = useState<HabitsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(() => {
    fetch('/api/habits')
      .then((r) => r.json())
      .then((d: HabitsData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(habit: HabitRow) {
    setToggling(habit.id)
    await fetch(`/api/habits/${habit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !habit.todayCompleted }),
    })
    setToggling(null)
    load()
  }

  const habits = data?.habits ?? []
  const completed = habits.filter((h) => h.todayCompleted).length
  const total = habits.length

  // Group by frequency
  const grouped: Record<string, HabitRow[]> = { daily: [], weekdays: [], weekly: [] }
  for (const h of habits) {
    if (grouped[h.frequency]) grouped[h.frequency].push(h)
    else grouped['daily'].push(h) // fallback unknown frequencies to daily
  }
  const activeGroups = FREQ_GROUPS.filter(({ key }) => grouped[key]?.length > 0)

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); setSelectedId(null) }}
        />
      )}

      {/* Header */}
      <div className="px-5 py-3 border-b border-border/60 shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">
            {data ? formatDate(data.date) : '—'}
          </p>
          {total > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground/50">
              {completed}/{total}
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="mt-2 h-px bg-border/60 overflow-hidden rounded-full">
            <div
              className="h-full bg-primary/70 rounded-full transition-all duration-500"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading && <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>}
        {!loading && total === 0 && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 px-5">
            No habits yet — tell the AI about a habit you want to build.
          </p>
        )}
        {!loading && total > 0 && (
          <div className="p-4 space-y-1">
            {activeGroups.map(({ key, label, borderClass, labelClass }, index) => (
              <div key={key}>
                {index > 0 && <div className="pt-4" />}
                <div className={`border-l-2 pl-3 ${borderClass}`}>
                  <p className={`text-[11px] font-medium uppercase tracking-widest mb-2 ${labelClass}`}>
                    {label}
                    <span className="font-mono font-normal ml-1.5 opacity-60 text-[10px]">· {grouped[key].length}</span>
                  </p>
                  <div className="space-y-1.5">
                    {grouped[key].map((habit) => (
                      <div
                        key={habit.id}
                        className={`group w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                          habit.todayCompleted
                            ? 'bg-emerald-500/8 dark:bg-emerald-500/[0.06]'
                            : 'bg-muted/30 hover:bg-muted/60'
                        }`}
                      >
                        <button
                          onClick={() => toggle(habit)}
                          disabled={toggling === habit.id}
                          className="shrink-0"
                        >
                          <div className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all ${
                            habit.todayCompleted
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-border/60'
                          }`}>
                            {habit.todayCompleted && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] font-serif truncate ${habit.todayCompleted ? 'line-through text-muted-foreground/50' : 'text-foreground/85'}`}>
                            {habit.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground/40 font-mono mt-0.5">
                            {habitSubLabel(habit)}
                          </p>
                        </div>

                        {habit.streak > 1 && (
                          <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-orange-400/10 text-orange-400/60 shrink-0">
                            {habit.streak}d
                          </span>
                        )}

                        <button
                          onClick={() => setSelectedId(habit.id)}
                          className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all"
                          title="View / edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
