'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ArchivedTask {
  id: number
  name: string
  dueDate: string | null
  completedAt: string
  archived: boolean
}

function groupByMonth(tasks: ArchivedTask[]): Map<string, ArchivedTask[]> {
  const map = new Map<string, ArchivedTask[]>()
  for (const task of tasks) {
    const key = task.completedAt.slice(0, 7) // "YYYY-MM"
    const group = map.get(key) ?? []
    group.push(task)
    map.set(key, group)
  }
  return map
}

function formatMonth(key: string): string {
  const [year, month] = key.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1, 1)
  const now = new Date()
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This month'
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function ActivityPanel() {
  const [archived, setArchived] = useState<ArchivedTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then(({ tasks }: { tasks: ArchivedTask[] }) => {
        setArchived(tasks.filter((t) => t.archived && t.completedAt))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const grouped = groupByMonth(archived)

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        {loading && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>
        )}
        {!loading && archived.length === 0 && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 px-5 font-serif italic">
            No archived tasks yet — completed tasks appear here after 7 days.
          </p>
        )}
        {!loading && archived.length > 0 && (
          <div className="p-4 space-y-1">
            {[...grouped.entries()].map(([month, tasks], index) => (
              <div key={month}>
                {index > 0 && <div className="pt-4" />}
                <div className="border-l-2 border-emerald-400/25 pl-3">
                  <p className="text-[11px] font-medium uppercase tracking-widest mb-2 text-emerald-600/50 dark:text-emerald-400/40">
                    {formatMonth(month)}
                    <span className="font-mono font-normal ml-1.5 opacity-60 text-[10px]">· {tasks.length}</span>
                  </p>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/10"
                      >
                        <div className="w-2 h-2 rounded-full bg-emerald-400/40 shrink-0" />
                        <p className="text-[13px] font-serif text-foreground/50 line-through flex-1 truncate">
                          {task.name}
                        </p>
                        <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">
                          {task.completedAt.slice(0, 10)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
