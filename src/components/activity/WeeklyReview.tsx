'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { todayStr, addDays } from '@/lib/date'

interface ReviewData {
  weekStart: string
  weekEnd: string
  habits: { due: number; done: number; rate: number | null; breakdown: { id: number; name: string; due: number; done: number }[] }
  tasks: { completed: number; created: number; overdue: number }
  staleGoals: { id: number; name: string; lastActivity: string | null }[]
}

function sundayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return addDays(dateStr, -d.getDay())
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(s)} – ${fmt(e)}`
}

export function WeeklyReview() {
  const [weekStart, setWeekStart] = useState(() => sundayOf(todayStr()))
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/review?weekStart=${weekStart}`)
      .then((r) => r.json())
      .then((d: ReviewData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const isCurrentWeek = weekStart === sundayOf(todayStr())

  return (
    <div className="mb-2 border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
        <p className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest">
          Weekly review
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Previous week"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-muted-foreground/70 w-28 text-center">
            {data ? formatRange(data.weekStart, data.weekEnd) : '…'}
          </span>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            disabled={isCurrentWeek}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Next week"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-[12px] text-muted-foreground/50 text-center py-6 font-mono">loading…</p>
      )}

      {!loading && data && (
        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="px-3 py-2.5 rounded-lg bg-muted/20">
            <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-1">Habits</p>
            <p className="text-[18px] font-serif text-foreground/85">
              {data.habits.rate === null ? '—' : `${data.habits.rate}%`}
            </p>
            <p className="text-[10px] text-muted-foreground/55 mt-0.5">
              {data.habits.done}/{data.habits.due} done
            </p>
          </div>
          <div className="px-3 py-2.5 rounded-lg bg-muted/20">
            <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-1">Tasks</p>
            <p className="text-[18px] font-serif text-foreground/85">{data.tasks.completed}</p>
            <p className="text-[10px] text-muted-foreground/55 mt-0.5">
              completed · {data.tasks.created} new
              {data.tasks.overdue > 0 && (
                <span className="text-red-400/70"> · {data.tasks.overdue} overdue</span>
              )}
            </p>
          </div>

          {data.staleGoals.length > 0 && (
            <div className="col-span-2 px-3 py-2.5 rounded-lg bg-amber-500/[0.07] border border-amber-500/20">
              <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400/80 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Stale goals
              </p>
              <div className="space-y-1">
                {data.staleGoals.map((g) => (
                  <p key={g.id} className="text-[12px] font-serif text-foreground/75">
                    {g.name}
                    <span className="text-muted-foreground/55 text-[10px] font-mono ml-1.5">
                      {g.lastActivity ? `· last activity ${g.lastActivity}` : '· no linked activity yet'}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
