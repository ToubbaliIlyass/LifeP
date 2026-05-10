'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CheckCircle2, Circle, Clock, MapPin } from 'lucide-react'

interface HabitRow {
  id: number
  name: string
  frequency: string
  todayCompleted: boolean
  streak: number
}

interface TaskRow {
  id: number
  name: string
  status: 'todo' | 'in-progress' | 'done'
  dueDate: string | null
}

interface EventRow {
  id: number
  name: string
  date: string | null
  time: string | null
  location: string | null
}

interface TodayViewProps {
  onNavigate?: (tab: string) => void
}

function formatDay(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === 'done') return false
  return dueDate < new Date().toISOString().split('T')[0]
}

function isDueToday(dueDate: string | null) {
  if (!dueDate) return false
  return dueDate === new Date().toISOString().split('T')[0]
}

export function TodayView({ onNavigate }: TodayViewProps) {
  const [habits, setHabits] = useState<HabitRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<number | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/habits').then((r) => r.json()),
      fetch('/api/tasks').then((r) => r.json()),
      fetch('/api/events').then((r) => r.json()),
    ])
      .then(([habitsData, tasksData, eventsData]) => {
        setHabits((habitsData as { habits: HabitRow[] }).habits ?? [])
        setTasks((tasksData as { tasks: TaskRow[] }).tasks ?? [])
        setEvents((eventsData as { events: EventRow[] }).events?.filter((e: EventRow) => e.date === today) ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [today])

  useEffect(() => { load() }, [load])

  async function toggleHabit(habit: HabitRow) {
    setToggling(habit.id)
    await fetch(`/api/habits/${habit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !habit.todayCompleted }),
    })
    setToggling(null)
    load()
  }

  async function cycleTask(task: TaskRow) {
    const next = task.status === 'todo' ? 'in-progress' : 'done'
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    load()
  }

  const urgentTasks = tasks.filter((t) => t.status !== 'done' && (isOverdue(t.dueDate, t.status) || isDueToday(t.dueDate)))
  const completedHabits = habits.filter((h) => h.todayCompleted).length
  const isEmpty = !loading && habits.length === 0 && urgentTasks.length === 0 && events.length === 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[12px] font-mono text-muted-foreground/40">loading…</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-8 py-8 max-w-2xl">

        {/* Date heading */}
        <div className="mb-8">
          <p className="text-[11px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
          </p>
          <h1 className="text-3xl font-bold text-foreground font-serif leading-tight">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </h1>
        </div>

        {isEmpty && (
          <div className="py-10 text-center">
            <p className="text-[13px] text-muted-foreground/60 font-serif italic">
              Nothing urgent today. Open the chat to add something.
            </p>
          </div>
        )}

        {/* Habits */}
        {habits.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                Habits · {completedHabits}/{habits.length}
              </h2>
              <button
                onClick={() => onNavigate?.('habits')}
                className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors font-mono"
              >
                view all →
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-border/40 rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: habits.length > 0 ? `${(completedHabits / habits.length) * 100}%` : '0%' }}
              />
            </div>

            <div className="space-y-1.5">
              {habits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h)}
                  disabled={toggling === h.id}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors text-left group ${
                    h.todayCompleted ? 'bg-muted/20' : 'bg-muted/20 hover:bg-muted/40'
                  }`}
                >
                  {h.todayCompleted
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    : <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />
                  }
                  <span className={`text-[13px] font-serif flex-1 ${h.todayCompleted ? 'line-through text-muted-foreground/40' : 'text-foreground/85'}`}>
                    {h.name}
                  </span>
                  {h.streak > 1 && (
                    <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">
                      {h.streak}d
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Tasks due today / overdue */}
        {urgentTasks.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                Tasks · {urgentTasks.length}
              </h2>
              <button
                onClick={() => onNavigate?.('tasks')}
                className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors font-mono"
              >
                view all →
              </button>
            </div>
            <div className="space-y-1.5">
              {urgentTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => cycleTask(t)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors text-left group"
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'in-progress' ? 'bg-sky-400' : 'bg-muted-foreground/30'}`} />
                  <span className="text-[13px] font-serif flex-1 text-foreground/85">
                    {t.name}
                  </span>
                  {isOverdue(t.dueDate, t.status) && (
                    <span className="text-[10px] font-mono text-red-400/60 shrink-0">overdue</span>
                  )}
                  {isDueToday(t.dueDate) && !isOverdue(t.dueDate, t.status) && (
                    <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> today
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Events today */}
        {events.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                Events today · {events.length}
              </h2>
              <button
                onClick={() => onNavigate?.('events')}
                className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors font-mono"
              >
                view all →
              </button>
            </div>
            <div className="space-y-1.5">
              {events.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted/20">
                  {e.time && (
                    <span className="text-[11px] font-mono text-muted-foreground/50 shrink-0 mt-0.5 w-10">
                      {e.time.slice(0, 5)}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-serif text-foreground/85">{e.name}</p>
                    {e.location && (
                      <p className="text-[10px] text-muted-foreground/40 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />{e.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </ScrollArea>
  )
}
