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

const STATUS_DOT: Record<string, string> = {
  'todo':        'bg-muted-foreground/30',
  'in-progress': 'bg-sky-400',
  'done':        'bg-emerald-400',
}

const STATUS_LABEL: Record<string, string> = {
  'todo':        'to do',
  'in-progress': 'in progress',
  'done':        'done',
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'done') return false
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

  const active = tasks.filter((t) => t.status !== 'done').length

  const groups: Record<string, TaskRow[]> = {
    'todo':        tasks.filter((t) => t.status === 'todo'),
    'in-progress': tasks.filter((t) => t.status === 'in-progress'),
    'done':        tasks.filter((t) => t.status === 'done'),
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/60 shrink-0">
        <div className="flex items-baseline justify-between">
          <p
            className="text-lg font-medium italic text-foreground/80"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Tasks
          </p>
          {tasks.length > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground/50">
              {active} remaining
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading && <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>}
        {!loading && tasks.length === 0 && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 px-5">
            No tasks yet — tell the AI about something you need to get done.
          </p>
        )}
        {!loading && tasks.length > 0 && (
          <div className="p-4 space-y-5">
            {(['todo', 'in-progress', 'done'] as const).map((status) => {
              const group = groups[status]
              if (group.length === 0) return null
              return (
                <div key={status}>
                  <p className="text-[9px] uppercase tracking-widest font-mono text-muted-foreground/40 mb-2 px-1">
                    {STATUS_LABEL[status]} · {group.length}
                  </p>
                  <div className="space-y-1">
                    {group.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors group">
                        {/* Status dot — click to cycle */}
                        <button
                          onClick={() => cycleStatus(task)}
                          disabled={cycling === task.id}
                          className="shrink-0"
                          title={`Advance to: ${STATUS_CYCLE[task.status]}`}
                        >
                          <div className={`w-2 h-2 rounded-full transition-all group-hover:scale-125 ${STATUS_DOT[task.status]}`} />
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] font-medium truncate ${status === 'done' ? 'line-through text-muted-foreground/40' : 'text-foreground/85'}`}>
                            {task.name}
                          </p>
                          {task.dueDate && (
                            <p className={`text-[10px] font-mono mt-0.5 ${isOverdue(task.dueDate, task.status) ? 'text-red-400/70' : 'text-muted-foreground/40'}`}>
                              {isOverdue(task.dueDate, task.status) ? 'overdue · ' : ''}{task.dueDate}
                            </p>
                          )}
                        </div>

                        <span className={`text-[9px] font-mono shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                          status === 'done' ? 'text-muted-foreground/40' : 'text-muted-foreground/50'
                        }`}>
                          → {STATUS_CYCLE[task.status]}
                        </span>
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
