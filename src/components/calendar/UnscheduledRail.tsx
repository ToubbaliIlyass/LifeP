'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

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
      <p className={`text-[12px] font-serif truncate ${type === 'task' ? 'text-sky-200' : 'text-emerald-200'}`}>
        {label}
      </p>
      {sublabel && (
        <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">{sublabel}</p>
      )}
    </div>
  )
}

// ── Rail ──────────────────────────────────────────────────────────────

export function UnscheduledRail({ date, scheduledNodeIds }: UnscheduledRailProps) {
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

  const today = new Date().toISOString().split('T')[0]

  const unscheduledTasks = tasks.filter(
    (t) =>
      !t.archived &&
      t.status !== 'done' &&
      t.dueDate !== null &&
      t.dueDate <= today &&
      !scheduledNodeIds.has(t.id),
  )

  const unscheduledHabits = habits.filter(
    (h) =>
      isHabitForDate(h, date) &&
      !h.todayCompleted &&
      !scheduledNodeIds.has(h.id),
  )

  const isEmpty = !loading && unscheduledTasks.length === 0 && unscheduledHabits.length === 0

  return (
    <div className="w-52 shrink-0 border-r border-border/60 flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/40 shrink-0">
        <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">
          Unscheduled
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading && (
          <p className="text-[11px] font-mono text-muted-foreground/30 text-center pt-4">loading…</p>
        )}

        {isEmpty && (
          <p className="text-[11px] font-serif text-muted-foreground/30 text-center pt-4 italic leading-relaxed">
            All caught up — drag a task here from the graph or add one via chat.
          </p>
        )}

        {unscheduledTasks.length > 0 && (
          <div>
            <p className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-widest mb-2 px-1">
              Tasks
            </p>
            <div className="space-y-1.5">
              {unscheduledTasks.map((t) => (
                <DraggableItem
                  key={t.id}
                  id={`rail:${t.id}`}
                  label={t.name}
                  sublabel={t.dueDate ? (t.dueDate < today ? 'overdue' : 'due today') : undefined}
                  type="task"
                />
              ))}
            </div>
          </div>
        )}

        {unscheduledHabits.length > 0 && (
          <div>
            <p className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-widest mb-2 px-1">
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
        <p className="text-[9px] font-mono text-muted-foreground/25 leading-relaxed">
          Drag items onto the timeline to schedule them
        </p>
      </div>
    </div>
  )
}
