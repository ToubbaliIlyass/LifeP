'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { todayStr } from '@/lib/date'

interface RailTask {
  id: number
  name: string
  status: string
  dueDate: string | null
  archived: boolean
}

interface RailHabit {
  id: number
  name: string
  frequency: string
  daysOfWeek: number[] | null
  todayCompleted: boolean
}

interface UnscheduledRailProps {
  date: string
  scheduledNodeIds: Set<number>
  /** Below md this rail renders inside a mobile drawer — pass a close handler to show a header close button there. */
  onClose?: () => void
  onCountChange?: (count: number) => void
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isHabitForDate(habit: RailHabit, date: string): boolean {
  const dow = new Date(date + 'T00:00:00').getDay()
  if (habit.frequency === 'daily') return true
  if (habit.frequency === 'weekdays') {
    if (habit.daysOfWeek?.length) return habit.daysOfWeek.includes(dow)
    return dow >= 1 && dow <= 5
  }
  if (habit.frequency === 'weekly') {
    return habit.daysOfWeek?.includes(dow) ?? false
  }
  return true
}

// ── Draggable rail item ───────────────────────────────────────────────

interface DraggableItemProps {
  id: string
  label: string
  sublabel?: string
  type: 'task' | 'habit'
}

function DraggableItem({ id, label, sublabel, type }: DraggableItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = transform ? { transform: CSS.Transform.toString(transform) } : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-all ${
        type === 'task'
          ? 'bg-sky-500/10 border-sky-400/25 hover:bg-sky-500/20'
          : 'bg-emerald-500/10 border-emerald-400/25 hover:bg-emerald-500/20'
      } ${isDragging ? 'opacity-30' : 'opacity-100'}`}
      {...listeners}
      {...attributes}
    >
      <p className={`text-[12px] font-serif truncate ${type === 'task' ? 'text-sky-700 dark:text-sky-200' : 'text-emerald-700 dark:text-emerald-200'}`}>
        {label}
      </p>
      {sublabel && (
        <p className="text-[9px] font-mono text-muted-foreground/65 mt-0.5">{sublabel}</p>
      )}
    </div>
  )
}

// ── Rail ──────────────────────────────────────────────────────────────

export function UnscheduledRail({ date, scheduledNodeIds, onClose, onCountChange }: UnscheduledRailProps) {
  const [tasks, setTasks] = useState<RailTask[]>([])
  const [habits, setHabits] = useState<RailHabit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/tasks').then((r) => r.json()),
      fetch('/api/habits').then((r) => r.json()),
    ])
      .then(([td, hd]) => {
        setTasks((td as { tasks: RailTask[] }).tasks ?? [])
        setHabits((hd as { habits: RailHabit[] }).habits ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [date])

  const today = todayStr()

  // Previously only overdue/due-today tasks showed here, so anything
  // without a due date (most tasks) or due further out was invisible —
  // this is meant to be "things you might want to schedule," not just
  // "things already late," so surface every open task and let the sort
  // below put the ones that actually need attention first.
  const unscheduledTasks = tasks
    .filter((t) => !t.archived && t.status !== 'done' && !scheduledNodeIds.has(t.id))
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })

  const unscheduledHabits = habits.filter(
    (h) =>
      isHabitForDate(h, date) &&
      !h.todayCompleted &&
      !scheduledNodeIds.has(h.id),
  )

  const isEmpty = !loading && unscheduledTasks.length === 0 && unscheduledHabits.length === 0

  useEffect(() => {
    onCountChange?.(unscheduledTasks.length + unscheduledHabits.length)
  }, [unscheduledTasks.length, unscheduledHabits.length, onCountChange])

  return (
    <div className="w-52 shrink-0 border-r border-border/60 flex flex-col overflow-hidden h-full bg-background">
      <div className="px-4 py-2.5 border-b border-border/40 shrink-0 flex items-center">
        <p className="text-[10px] font-mono text-muted-foreground/65 uppercase tracking-widest flex-1">
          Unscheduled
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 -mr-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40"
            aria-label="Close unscheduled panel"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {loading && (
          <p className="text-[11px] font-mono text-muted-foreground/55 text-center pt-4">loading…</p>
        )}

        {isEmpty && (
          <p className="text-[11px] font-serif text-muted-foreground/55 text-center pt-4 italic leading-relaxed">
            All caught up — drag a task here from the graph or add one via chat.
          </p>
        )}

        {unscheduledTasks.length > 0 && (
          <div>
            <p className="text-[9px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-2 px-1">
              Tasks
            </p>
            <div className="space-y-1.5">
              {unscheduledTasks.map((t) => (
                <DraggableItem
                  key={t.id}
                  id={`rail:${t.id}`}
                  label={t.name}
                  sublabel={
                    t.dueDate
                      ? t.dueDate < today ? 'overdue' : t.dueDate === today ? 'due today' : `due ${t.dueDate}`
                      : undefined
                  }
                  type="task"
                />
              ))}
            </div>
          </div>
        )}

        {unscheduledHabits.length > 0 && (
          <div>
            <p className="text-[9px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-2 px-1">
              Habits
            </p>
            <div className="space-y-1.5">
              {unscheduledHabits.map((h) => (
                <DraggableItem
                  key={h.id}
                  id={`rail:${h.id}`}
                  label={h.name}
                  sublabel={
                    h.frequency === 'weekly' && h.daysOfWeek?.length
                      ? h.daysOfWeek.map((d) => DOW[d]).join(', ')
                      : h.frequency
                  }
                  type="habit"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-border/40 shrink-0">
        <p className="text-[9px] font-mono text-muted-foreground/50 leading-relaxed">
          Drag items onto the timeline to schedule them
        </p>
      </div>
    </div>
  )
}
