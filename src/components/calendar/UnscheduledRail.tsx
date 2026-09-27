'use client'

import { useEffect, useRef, useState } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import { todayStr } from '@/lib/date'

interface RailTask {
  id: number
  name: string
  status: string
  dueDate: string | null
  archived: boolean
  estimatedMinutes?: number | null
}

interface RailHabit {
  id: number
  name: string
  frequency: string
  daysOfWeek: number[] | null
  todayCompleted: boolean
  durationMinutes?: number | null
}

/** Dated work from an enabled module — an assignment, an exam, a piece. */
interface RailExtra {
  id: number
  type: string
  name: string
  date: string | null
  minutes: number
}

/** What gets placed when an item is dropped or tapped into the calendar. */
export interface RailPick {
  sourceId: number
  title: string
  minutes: number
  /**
   * So the calendar can colour the new block without re-reading the graph.
   * Open to any node type: the rail used to carry tasks and habits only,
   * which is why an assignment due on Thursday could not be given an hour
   * without inventing a task about it.
   */
  sourceType: string
}

interface UnscheduledRailProps {
  date: string
  scheduledNodeIds: Set<number>
  /** Below md this rail renders inside a mobile drawer — pass a close handler to show a header close button there. */
  onClose?: () => void
  onCountChange?: (count: number) => void
  /** Tap-to-place, for touch screens where dragging out of a drawer is not possible. */
  onPick?: (item: RailPick) => void
  pickedId?: number | null
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_TASK_MINUTES = 30
const DEFAULT_HABIT_MINUTES = 15

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

function RailItem({
  item, sublabel, type, picked, onPick,
}: { item: RailPick; sublabel?: string; type: 'task' | 'habit' | 'other'; picked: boolean; onPick?: (item: RailPick) => void }) {
  return (
    <div
      // Read by FullCalendar's Draggable (set up on the list below).
      data-rail-item=""
      data-source-id={item.sourceId}
      data-title={item.title}
      data-minutes={item.minutes}
      data-source-type={item.sourceType}
      role="button"
      tabIndex={0}
      onClick={() => onPick?.(item)}
      onKeyDown={(e) => { if (e.key === 'Enter') onPick?.(item) }}
      className={`px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-colors ${
        type === 'task'
          ? 'bg-sky-500/10 border-sky-400/25 hover:bg-sky-500/20'
          : type === 'habit'
            ? 'bg-emerald-500/10 border-emerald-400/25 hover:bg-emerald-500/20'
            : 'bg-violet-500/10 border-violet-400/25 hover:bg-violet-500/20'
      } ${picked ? 'ring-2 ring-primary/60' : ''}`}
    >
      <p className={`text-[13px] truncate ${
        type === 'task' ? 'text-sky-700 dark:text-sky-200'
          : type === 'habit' ? 'text-emerald-700 dark:text-emerald-200'
          : 'text-violet-700 dark:text-violet-200'
      }`}>
        {item.title}
      </p>
      <p className="text-[11px] text-muted-foreground/75 mt-0.5">
        {[sublabel, `${item.minutes} min`].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}

export function UnscheduledRail({ date, scheduledNodeIds, onClose, onCountChange, onPick, pickedId }: UnscheduledRailProps) {
  const [tasks, setTasks] = useState<RailTask[]>([])
  const [habits, setHabits] = useState<RailHabit[]>([])
  const [extras, setExtras] = useState<RailExtra[]>([])
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/tasks').then((r) => r.json()),
      fetch('/api/habits').then((r) => r.json()),
      fetch('/api/schedulable').then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([td, hd, sd]) => {
        setTasks((td as { tasks: RailTask[] }).tasks ?? [])
        setHabits((hd as { habits: RailHabit[] }).habits ?? [])
        setExtras((sd as { items: RailExtra[] }).items ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [date])

  /*
   * One Draggable for the whole list, matching items by selector, so items
   * that appear or disappear as things get scheduled need no setup of their
   * own. `create: false` — the calendar's `drop` handler writes the block and
   * refetches, rather than FullCalendar inventing a local event that the
   * server has never heard of.
   */
  useEffect(() => {
    if (!listRef.current) return
    const draggable = new Draggable(listRef.current, {
      itemSelector: '[data-rail-item]',
      eventData: (el) => ({
        title: el.dataset.title,
        duration: { minutes: Number(el.dataset.minutes) || DEFAULT_TASK_MINUTES },
        create: false,
      }),
    })
    return () => draggable.destroy()
  }, [])

  const today = todayStr()

  // Every open task, not just late ones: this is "things you might want to
  // schedule". The sort puts the ones that need attention first.
  const unscheduledTasks = tasks
    .filter((t) => !t.archived && t.status !== 'done' && !scheduledNodeIds.has(t.id))
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })

  const unscheduledHabits = habits.filter(
    (h) => isHabitForDate(h, date) && !h.todayCompleted && !scheduledNodeIds.has(h.id),
  )

  const unscheduledExtras = extras.filter((e) => !scheduledNodeIds.has(e.id))

  const isEmpty = !loading && unscheduledTasks.length === 0 && unscheduledHabits.length === 0 && unscheduledExtras.length === 0

  useEffect(() => {
    onCountChange?.(unscheduledTasks.length + unscheduledHabits.length + unscheduledExtras.length)
  }, [unscheduledTasks.length, unscheduledHabits.length, unscheduledExtras.length, onCountChange])

  return (
    <div className="w-60 md:w-52 shrink-0 border-r border-border/60 flex flex-col overflow-hidden h-full bg-background">
      <div className="px-4 pt-3.5 pb-3 border-b border-border/40 shrink-0 flex items-start">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/75">To place</p>
          {/* Said up front, where it cannot scroll away. */}
          <p className="text-[11.5px] text-muted-foreground/65 mt-1 leading-snug">
            Drag one onto a time, or tap it and then tap a time.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 -mr-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {loading && (
          <p className="text-[12px] text-muted-foreground/60 text-center pt-4">Loading…</p>
        )}

        {isEmpty && (
          <p className="text-[11px] text-muted-foreground/55 text-center pt-4 italic leading-relaxed">
            Nothing waiting for a time. Anything you tell Today lands here, or straight on the calendar.
          </p>
        )}

        {unscheduledTasks.length > 0 && (
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2 px-1">Tasks</p>
            <div className="space-y-1.5">
              {unscheduledTasks.map((t) => (
                <RailItem
                  key={t.id}
                  type="task"
                  item={{ sourceId: t.id, title: t.name, sourceType: 'Task', minutes: t.estimatedMinutes && t.estimatedMinutes > 0 ? t.estimatedMinutes : DEFAULT_TASK_MINUTES }}
                  picked={pickedId === t.id}
                  onPick={onPick}
                  sublabel={t.dueDate ? (t.dueDate < today ? 'overdue' : t.dueDate === today ? 'due today' : `due ${t.dueDate}`) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {unscheduledHabits.length > 0 && (
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2 px-1">Habits</p>
            <div className="space-y-1.5">
              {unscheduledHabits.map((h) => (
                <RailItem
                  key={h.id}
                  type="habit"
                  item={{ sourceId: h.id, title: h.name, sourceType: 'Habit', minutes: h.durationMinutes && h.durationMinutes > 0 ? h.durationMinutes : DEFAULT_HABIT_MINUTES }}
                  picked={pickedId === h.id}
                  onPick={onPick}
                  sublabel={h.frequency === 'weekly' && h.daysOfWeek?.length ? h.daysOfWeek.map((d) => DOW[d]).join(', ') : h.frequency}
                />
              ))}
            </div>
          </div>
        )}

        {unscheduledExtras.length > 0 && (
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2 px-1">Coming up</p>
            <div className="space-y-1.5">
              {unscheduledExtras.map((e) => (
                <RailItem
                  key={e.id}
                  type="other"
                  item={{ sourceId: e.id, title: e.name, sourceType: e.type, minutes: e.minutes }}
                  picked={pickedId === e.id}
                  onPick={onPick}
                  sublabel={
                    e.date
                      ? e.date < today ? 'overdue' : e.date === today ? 'today' : e.date
                      : e.type.toLowerCase()
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
