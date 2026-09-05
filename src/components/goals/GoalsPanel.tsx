'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Target } from 'lucide-react'
import { GoalDetail } from './GoalDetail'
import { todayStr } from '@/lib/date'

interface Milestone {
  id: number
  status: 'todo' | 'in-progress' | 'done'
}

interface GoalRow {
  id: number
  name: string
  description: string | null
  targetDate: string | null
  status: string
  linkedCount: number
  progress: number | null
  milestones: Milestone[]
}

/** Active first — paused and completed are reference, not the working set. */
const GROUPS: { status: string; label: string; accent: string }[] = [
  { status: 'active', label: 'Active', accent: 'border-primary/40' },
  { status: 'paused', label: 'Paused', accent: 'border-amber-400/40' },
  { status: 'completed', label: 'Completed', accent: 'border-emerald-400/30' },
]

export function GoalsPanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const load = useCallback(() => {
    fetch('/api/goals')
      .then((r) => r.json())
      .then(({ goals: g }: { goals: GoalRow[] }) => { setGoals(g ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  async function addGoal(e: React.FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    await fetch('/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Goal', properties: { name, status: 'active' } }),
    })
    setDraft('')
    setAdding(false)
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[12px] font-mono text-muted-foreground/65">loading…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {viewingId !== null && (
        <GoalDetail
          goalId={viewingId}
          onClose={() => setViewingId(null)}
          onChanged={load}
        />
      )}

      <ScrollArea className="flex-1">
        <div className="px-8 py-8 max-w-3xl">

          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest">
              Goals · {goals.length}
            </p>
            <button
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New goal
            </button>
          </div>

          {adding && (
            <form onSubmit={addGoal} className="flex items-center gap-2 mb-6">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What do you want to be true?"
                className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-3 py-2.5 text-[14px] font-serif focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
            </form>
          )}

          {goals.length === 0 && !adding && (
            <div className="py-16 text-center">
              <Target className="w-8 h-8 mx-auto text-muted-foreground/25 mb-3" />
              <p className="text-[13px] text-muted-foreground/60 font-serif italic max-w-[36ch] mx-auto">
                No goals yet. A goal is the thing your habits and tasks are supposed to add up to.
              </p>
            </div>
          )}

          {GROUPS.map(({ status, label, accent }) => {
            const group = goals.filter((g) => (g.status ?? 'active') === status)
            if (group.length === 0) return null
            return (
              <section key={status} className="mb-8">
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/55 mb-2.5">
                  {label}
                  <span className="ml-1.5 opacity-60 text-[10px]">· {group.length}</span>
                </p>
                <div className="space-y-2">
                  {group.map((g) => {
                    const overdue =
                      g.targetDate && g.status === 'active' && g.targetDate < todayStr()
                    return (
                      <button
                        key={g.id}
                        onClick={() => setViewingId(g.id)}
                        className={`block w-full text-left px-4 py-3.5 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors border-l-2 ${accent}`}
                      >
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <span className={`text-[14px] font-serif truncate ${g.status === 'completed' ? 'text-muted-foreground/60' : 'text-foreground/90'}`}>
                            {g.name}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground/55 shrink-0 tabular-nums">
                            {g.progress === null ? 'nothing linked' : `${g.progress}%`}
                          </span>
                        </div>

                        {g.description && (
                          <p className="text-[12px] text-muted-foreground/60 mb-2 line-clamp-1">{g.description}</p>
                        )}

                        <div className="h-0.5 bg-border/40 rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${g.progress ?? 0}%` }}
                          />
                        </div>

                        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
                          <span>
                            {g.milestones.length} milestone{g.milestones.length === 1 ? '' : 's'}
                          </span>
                          <span>{g.linkedCount} linked</span>
                          {g.targetDate && (
                            <span className={overdue ? 'text-destructive/80' : ''}>
                              {overdue ? 'target passed · ' : 'target '}{g.targetDate}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
