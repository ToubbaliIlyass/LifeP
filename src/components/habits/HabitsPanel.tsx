'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

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

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null
  return (
    <span className="text-[10px] font-medium text-orange-500">
      🔥 {streak}
    </span>
  )
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
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-xs text-muted-foreground">{data ? formatDate(data.date) : '—'}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm font-semibold">Today&apos;s Habits</p>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">{completed}/{total} done</span>
          )}
        </div>
        {total > 0 && (
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading && (
          <p className="text-sm text-muted-foreground text-center pt-8">Loading…</p>
        )}
        {!loading && total === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8 px-4">
            No habits yet — tell the AI about a habit you want to build.
          </p>
        )}
        {!loading && total > 0 && (
          <div className="p-3 space-y-2">
            {data!.habits.map((habit) => (
              <button
                key={habit.id}
                onClick={() => toggle(habit)}
                disabled={toggling === habit.id}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-colors ${
                  habit.todayCompleted
                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800'
                    : 'bg-card border-border hover:bg-muted/50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  habit.todayCompleted
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-muted-foreground/40'
                }`}>
                  {habit.todayCompleted && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${habit.todayCompleted ? 'line-through text-muted-foreground' : ''}`}>
                    {habit.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {habit.frequency}{habit.durationMinutes ? ` · ${habit.durationMinutes}min` : ''}
                  </p>
                </div>
                <StreakBadge streak={habit.streak} />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
