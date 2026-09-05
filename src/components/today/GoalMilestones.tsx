'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { StatusCheckbox } from '@/components/ui/completion-checkbox'

interface Milestone {
  id: number
  name: string
  status: 'todo' | 'in-progress' | 'done'
  dueDate: string | null
}

interface GoalMilestonesProps {
  goalId: number
  goalName: string
  targetDate: string | null
  progress: number | null
  milestones: Milestone[]
  onClose: () => void
  onChanged: () => void
}

export function GoalMilestones({ goalId, goalName, targetDate, progress, milestones, onClose, onChanged }: GoalMilestonesProps) {
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toggling, setToggling] = useState<number | null>(null)

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault()
    const name = draftName.trim()
    if (!name) return
    setSubmitting(true)
    await fetch(`/api/goals/${goalId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setSubmitting(false)
    setDraftName('')
    setAdding(false)
    onChanged()
  }

  async function toggleMilestone(m: Milestone) {
    const next = m.status === 'done' ? 'todo' : 'done'
    setToggling(m.id)
    await fetch(`/api/tasks/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setToggling(null)
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col max-h-[85dvh]">
        <div className="flex items-start gap-2 px-5 py-4 border-b border-border/40 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-serif font-semibold text-foreground truncate">{goalName}</p>
            {targetDate && (
              <p className="text-[10px] font-mono text-muted-foreground/55 mt-0.5">target · {targetDate}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest">Progress</span>
            <span className="text-[11px] font-mono text-muted-foreground/70">{progress === null ? 'no linked activity' : `${progress}%`}</span>
          </div>
          <div className="h-1 bg-border/40 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress ?? 0}%` }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {milestones.length === 0 && !adding && (
            <p className="text-[12px] text-muted-foreground/55 text-center py-6 font-serif italic">
              No milestones yet — break this goal into concrete steps.
            </p>
          )}
          <div className="space-y-1.5">
            {milestones.map((m) => (
              <button
                key={m.id}
                onClick={() => toggleMilestone(m)}
                disabled={toggling === m.id}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors text-left"
              >
                <StatusCheckbox status={m.status} />
                <span className={`text-[13px] font-serif flex-1 ${m.status === 'done' ? 'line-through text-muted-foreground/65' : 'text-foreground/85'}`}>
                  {m.name}
                </span>
                {m.dueDate && (
                  <span className="text-[10px] font-mono text-muted-foreground/55 shrink-0">{m.dueDate}</span>
                )}
              </button>
            ))}
          </div>

          {adding ? (
            <form onSubmit={addMilestone} className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Milestone name…"
                className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-serif text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button
                type="submit"
                disabled={submitting || !draftName.trim()}
                className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 mt-2 text-[12px] text-muted-foreground/65 hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add milestone
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
