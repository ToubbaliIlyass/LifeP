'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pencil } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'

interface HabitRow {
  id: number
  name: string
  frequency: string
  durationMinutes: number | null
  todayCompleted: boolean
  streak: number
}

interface HabitsData {
  habits: HabitRow[]
  date: string
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

  const completed = data?.habits.filter((h) => h.todayCompleted).length ?? 0
  const total = data?.habits.length ?? 0

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); setSelectedId(null) }}
        />
      )}
      {/* Header — date + progress only, no title (shown in top bar) */}
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
          <div className="p-4 space-y-1.5">
            {data!.habits.map((habit) => (
              <div
                key={habit.id}
                className={`group w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  habit.todayCompleted
                    ? 'bg-emerald-500/8 dark:bg-emerald-500/[0.06]'
                    : 'bg-muted/30 hover:bg-muted/60'
                }`}
              >
                {/* Circle check — click to toggle */}
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
                    {habit.frequency}{habit.durationMinutes ? ` · ${habit.durationMinutes}min` : ''}
                  </p>
                </div>

                {habit.streak > 0 && (
                  <span className="text-[11px] font-mono text-orange-400/70 shrink-0">
                    🔥{habit.streak}
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
        )}
      </ScrollArea>
    </div>
  )
}
