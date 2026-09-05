'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CalendarClock, ChevronDown, Pencil } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { StatusCheckbox } from '@/components/ui/completion-checkbox'
import { ScheduleDialog } from './ScheduleDialog'
import { todayStr, addDays } from '@/lib/date'
import { useUndo } from '@/components/undo/UndoProvider'

interface Task {
  id: number
  name: string
  status: 'todo' | 'in-progress' | 'done'
  dueDate: string | null
  completedAt: string | null
  archived: boolean
  priority: 'low' | 'medium' | 'high'
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-400/80',
  medium: 'bg-amber-400/60',
  low: 'bg-muted-foreground/30',
}

const STATUS_CYCLE: Record<string, string> = {
  'todo': 'in-progress',
  'in-progress': 'done',
  'done': 'todo',
}

function getBucket(dueDate: string | null, status: Task['status']): string {
  if (status === 'done') return 'done'
  if (!dueDate) return 'undated'
  const today = todayStr()
  if (dueDate < today) return 'overdue'
  if (dueDate < addDays(today, 3)) return 'next3'
  if (dueDate < addDays(today, 7)) return 'nextWeek'
  if (dueDate <= addDays(today, 14)) return 'twoWeeks'
  return 'beyond'
}

const BUCKETS = [
  { key: 'overdue',   label: 'Overdue',     labelClass: 'text-red-400/80',           borderClass: 'border-red-400/50' },
  { key: 'next3',     label: 'Next 3 days', labelClass: 'text-amber-400/80',          borderClass: 'border-amber-400/40' },
  { key: 'nextWeek',  label: 'Next week',   labelClass: 'text-muted-foreground/60',   borderClass: 'border-yellow-400/25' },
  { key: 'twoWeeks',  label: 'Two weeks',   labelClass: 'text-muted-foreground/50',   borderClass: 'border-border/30' },
  { key: 'undated',   label: 'No date',     labelClass: 'text-muted-foreground/65',   borderClass: 'border-border/20' },
]

// Higher priority first; within the same priority, earlier due date first.
function sortByPriorityThenDate(a: Task, b: Task): number {
  const pDiff = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  if (pDiff !== 0) return pDiff
  if (!a.dueDate && !b.dueDate) return 0
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate.localeCompare(b.dueDate)
}

export function TasksPanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [cycling, setCycling] = useState<number | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [schedulingTask, setSchedulingTask] = useState<Task | null>(null)
  const { record } = useUndo()

  const load = useCallback(() => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then(({ tasks: t }: { tasks: Task[] }) => { setTasks(t); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Quick-add (outside this panel) bumps refreshKey so an already-open Tasks
  // tab picks up the new task without waiting for the next tab switch.
  useEffect(() => { load() }, [load, refreshKey])

  async function cycleStatus(task: Task) {
    const next = STATUS_CYCLE[task.status] ?? 'todo'
    const previous = task.status
    setCycling(task.id)
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    // Completing a recurring task also creates its next occurrence, so undo
    // has to remove that too — otherwise it would restore the status and
    // leave a duplicate behind.
    const { spawned } = ((await res.json().catch(() => ({}))) ?? {}) as { spawned?: { id: number } | null }
    setCycling(null)
    load()

    record(`"${task.name}" → ${next}`, async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: previous }),
      })
      if (spawned?.id) await fetch(`/api/nodes/${spawned.id}`, { method: 'DELETE' })
      load()
    })
  }

  const bucketed: Record<string, Task[]> = Object.fromEntries(BUCKETS.map((b) => [b.key, []]))
  const doneTasks: Task[] = []
  const archivedTasks: Task[] = []

  for (const task of tasks) {
    const bucket = getBucket(task.dueDate, task.status)
    if (bucket === 'beyond') continue
    if (bucket === 'done') {
      if (task.archived) archivedTasks.push(task)
      else doneTasks.push(task)
      continue
    }
    bucketed[bucket].push(task)
  }

  for (const key of Object.keys(bucketed)) {
    bucketed[key].sort(sortByPriorityThenDate)
  }

  const activeBuckets = BUCKETS.filter(({ key }) => bucketed[key]?.length > 0)

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); setSelectedId(null) }}
        />
      )}
      {schedulingTask && (
        <ScheduleDialog
          nodeId={schedulingTask.id}
          nodeName={schedulingTask.name}
          defaultDate={schedulingTask.dueDate}
          onClose={() => setSchedulingTask(null)}
          onScheduled={() => setSchedulingTask(null)}
        />
      )}
      <ScrollArea className="flex-1">
        {loading && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>
        )}
        {!loading && tasks.length === 0 && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 px-5">
            No tasks yet — tell the AI about something you need to get done.
          </p>
        )}
        {!loading && tasks.length > 0 && (
          <div className="p-4 space-y-1">
            {activeBuckets.map(({ key, label, labelClass, borderClass }, index) => {
              const group = bucketed[key]
              return (
                <div key={key}>
                  {index > 0 && <div className="pt-4" />}
                  <div className={`border-l-2 pl-3 ${borderClass}`}>
                    <p className={`text-[11px] font-medium uppercase tracking-widest mb-2 ${labelClass}`}>
                      {label}
                      <span className="font-mono font-normal ml-1.5 opacity-60 text-[10px]">· {group.length}</span>
                    </p>
                    <div className="space-y-1">
                      {group.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          cycling={cycling}
                          overdue={key === 'overdue'}
                          onCycle={cycleStatus}
                          onEdit={() => setSelectedId(task.id)}
                          onSchedule={() => setSchedulingTask(task)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}

            {doneTasks.length > 0 && (
              <div>
                {activeBuckets.length > 0 && <div className="pt-4" />}
                <div className="border-l-2 pl-3 border-emerald-400/30">
                  <button
                    onClick={() => setDoneOpen((o) => !o)}
                    className="flex items-center gap-1.5 mb-2 w-full text-left"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-widest text-emerald-600/60 dark:text-emerald-400/50">
                      Done
                      <span className="font-mono font-normal ml-1.5 opacity-60 text-[10px]">· {doneTasks.length}</span>
                    </p>
                    <ChevronDown
                      className={`w-3 h-3 text-muted-foreground/55 transition-transform ml-auto ${doneOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {doneOpen && (
                    <div className="space-y-1">
                      {doneTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          cycling={cycling}
                          overdue={false}
                          onCycle={cycleStatus}
                          onEdit={() => setSelectedId(task.id)}
                          onSchedule={() => setSchedulingTask(task)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {archivedTasks.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setArchivedOpen((o) => !o)}
                  className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/55 hover:text-muted-foreground/60 transition-colors px-3"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${archivedOpen ? 'rotate-180' : ''}`} />
                  Archived · {archivedTasks.length}
                </button>
                {archivedOpen && (
                  <div className="mt-2 space-y-1 opacity-50">
                    {archivedTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        cycling={cycling}
                        overdue={false}
                        onCycle={cycleStatus}
                        onEdit={() => setSelectedId(task.id)}
                        onSchedule={() => setSchedulingTask(task)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function TaskItem({
  task,
  cycling,
  overdue,
  onCycle,
  onEdit,
  onSchedule,
}: {
  task: Task
  cycling: number | null
  overdue: boolean
  onCycle: (task: Task) => void
  onEdit: () => void
  onSchedule: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors group">
      <button
        onClick={() => onCycle(task)}
        disabled={cycling === task.id}
        className="shrink-0"
        title={`Advance to: ${STATUS_CYCLE[task.status]}`}
      >
        <StatusCheckbox status={task.status} />
      </button>

      <div className="flex-1 min-w-0">
        <p className={`flex items-center gap-1.5 text-[13px] font-serif truncate ${task.status === 'done' ? 'line-through text-muted-foreground/65' : 'text-foreground/85'}`}>
          {task.priority !== 'medium' && task.status !== 'done' && (
            <span
              className={`shrink-0 w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`}
              title={`${task.priority} priority`}
            />
          )}
          <span className="truncate">{task.name}</span>
        </p>
        {task.dueDate && (
          <p className={`text-[10px] font-mono mt-0.5 ${overdue ? 'text-red-400/70' : 'text-muted-foreground/65'}`}>
            {overdue ? 'overdue · ' : ''}{task.dueDate}
          </p>
        )}
      </div>

      <button
        onClick={onSchedule}
        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all"
        title="Add to calendar"
      >
        <CalendarClock className="w-3 h-3" />
      </button>
      <button
        onClick={onEdit}
        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all"
        title="View / edit"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )
}
