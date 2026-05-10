'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

const STATUS_COLORS: Record<string, string> = {
  todo:      'bg-muted text-muted-foreground',
  submitted: 'bg-sky-200 text-sky-700 dark:bg-sky-800 dark:text-sky-300',
  graded:    'bg-emerald-200 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300',
}

export function AssignmentNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const status = typeof d.properties.status === 'string' ? d.properties.status : 'todo'
  const dueDate = typeof d.properties.dueDate === 'string' ? d.properties.dueDate : null
  const grade = typeof d.properties.grade === 'string' ? d.properties.grade : null
  return (
    <div className="bg-pink-50 dark:bg-pink-950 border border-pink-200 dark:border-pink-800 rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-pink-400" />
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <p className="text-[10px] text-pink-500 uppercase tracking-wide font-medium">Assignment</p>
        {grade && <span className="text-[10px] font-bold text-emerald-600">{grade}</span>}
      </div>
      <p className={`text-sm font-semibold leading-tight truncate text-pink-900 dark:text-pink-100 ${status === 'graded' ? 'line-through opacity-60' : ''}`}>{d.label}</p>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.todo}`}>{status}</span>
        {dueDate && <span className="text-[10px] text-pink-500">{dueDate}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-pink-400" />
    </div>
  )
}
