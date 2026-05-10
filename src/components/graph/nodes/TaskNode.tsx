'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

const STATUS_STYLES: Record<string, string> = {
  'todo':        'bg-muted text-muted-foreground',
  'in-progress': 'bg-sky-200 text-sky-700 dark:bg-sky-800 dark:text-sky-300',
  'done':        'bg-emerald-200 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300',
}

export function TaskNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const status = typeof d.properties.status === 'string' ? d.properties.status : 'todo'
  const dueDate = typeof d.properties.dueDate === 'string' ? d.properties.dueDate : null
  const overdue = dueDate && new Date(dueDate) < new Date(new Date().toDateString()) && status !== 'done'

  return (
    <div className={`border rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px] ${
      status === 'done'
        ? 'bg-muted/40 border-border opacity-70'
        : 'bg-sky-50 dark:bg-sky-950 border-sky-200 dark:border-sky-800'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-sky-400" />
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <p className="text-[10px] text-sky-600 uppercase tracking-wide font-medium">Task</p>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLES[status] ?? STATUS_STYLES['todo']}`}>
          {status}
        </span>
      </div>
      <p className={`text-sm font-semibold leading-tight truncate ${status === 'done' ? 'line-through text-muted-foreground' : 'text-sky-900 dark:text-sky-100'}`}>
        {d.label}
      </p>
      {dueDate && (
        <p className={`text-[10px] mt-1 ${overdue ? 'text-red-500 font-medium' : 'text-sky-500'}`}>
          {overdue ? 'Overdue · ' : ''}{dueDate}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-sky-400" />
    </div>
  )
}
