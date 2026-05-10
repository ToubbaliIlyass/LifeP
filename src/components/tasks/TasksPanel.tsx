'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface TaskRow {
  id: number
  name: string
  status: 'todo' | 'in-progress' | 'done'
  dueDate: string | null
}

const STATUS_CYCLE: Record<string, string> = {
  'todo': 'in-progress',
  'in-progress': 'done',
  'done': 'todo',
}

const STATUS_STYLES: Record<string, string> = {
  'todo':        'bg-muted text-muted-foreground',
  'in-progress': 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  'done':        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
}

const STATUS_LABELS: Record<string, string> = {
  'todo': 'To do',
  'in-progress': 'In progress',
  'done': 'Done',
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [cycling, setCycling] = useState<number | null>(null)

  const load = useCallback(() => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then(({ tasks: t }: { tasks: TaskRow[] }) => { setTasks(t); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function cycleStatus(task: TaskRow) {
    const next = STATUS_CYCLE[task.status] ?? 'todo'
    setCycling(task.id)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setCycling(null)
    load()
  }

  const groups = {
    'todo':        tasks.filter((t) => t.status === 'todo'),
    'in-progress': tasks.filter((t) => t.status === 'in-progress'),
    'done':        tasks.filter((t) => t.status === 'done'),
  }

  const active = tasks.filter((t) => t.status !== 'done').length
  const total = tasks.length

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Tasks</p>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">{active} remaining</span>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading && (
          <p className="text-sm text-muted-foreground text-center pt-8">Loading…</p>
        )}
        {!loading && total === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8 px-4">
            No tasks yet — tell the AI about something you need to get done.
          </p>
        )}
        {!loading && total > 0 && (
          <div className="p-3 space-y-4">
            {(['todo', 'in-progress', 'done'] as const).map((status) => {
              const group = groups[status]
              if (group.length === 0) return null
              return (
                <div key={status}>
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5 px-1">
                    {STATUS_LABELS[status]} · {group.length}
                  </p>
                  <div className="space-y-1.5">
                    {group.map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-card ${
                          status === 'done' ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                            {task.name}
                          </p>
                          {task.dueDate && (
                            <p className={`text-xs mt-0.5 ${isOverdue(task.dueDate) && status !== 'done' ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {isOverdue(task.dueDate) && status !== 'done' ? 'Overdue · ' : ''}{task.dueDate}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => cycleStatus(task)}
                          disabled={cycling === task.id}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors hover:opacity-80 ${STATUS_STYLES[task.status]}`}
                        >
                          {STATUS_LABELS[task.status]}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
