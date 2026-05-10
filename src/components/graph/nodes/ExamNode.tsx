'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function ExamNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const date = typeof d.properties.date === 'string' ? d.properties.date : null
  const time = typeof d.properties.time === 'string' ? d.properties.time : null
  const grade = typeof d.properties.grade === 'string' ? d.properties.grade : null
  const status = typeof d.properties.status === 'string' ? d.properties.status : 'upcoming'
  const done = status === 'taken' || status === 'graded'
  return (
    <div className={`border rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px] ${done ? 'bg-muted/40 border-border' : 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800'}`}>
      <Handle type="target" position={Position.Top} className="!bg-rose-400" />
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <p className="text-[10px] text-rose-500 uppercase tracking-wide font-medium">Exam</p>
        {grade && <span className="text-[10px] font-bold text-emerald-600">{grade}</span>}
      </div>
      <p className={`text-sm font-semibold leading-tight truncate ${done ? 'line-through text-muted-foreground' : 'text-rose-900 dark:text-rose-100'}`}>{d.label}</p>
      <div className="flex gap-1.5 mt-1 flex-wrap">
        {date && <span className="text-[10px] text-rose-600">{date}</span>}
        {time && <span className="text-[10px] text-rose-400">{time}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-rose-400" />
    </div>
  )
}
