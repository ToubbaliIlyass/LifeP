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
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${done ? 'bg-muted-foreground/30' : 'bg-rose-400 dark:bg-rose-500/80'}`} />
      <Handle type="target" position={Position.Top} className="!bg-rose-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <div className="flex items-center justify-between gap-1 mb-1">
          <p className="text-[9px] text-rose-400 dark:text-rose-400/80 uppercase tracking-widest font-mono font-medium">Exam</p>
          {grade && <span className="text-[10px] font-mono font-semibold text-emerald-400">{grade}</span>}
        </div>
        <p className={`text-[13px] font-medium leading-snug line-clamp-2 ${done ? 'line-through text-muted-foreground/50' : 'text-foreground/90'}`}>
          {d.label}
        </p>
        <div className="flex gap-2 mt-1">
          {date && <span className="text-[10px] text-muted-foreground/50 font-mono">{date}</span>}
          {time && <span className="text-[10px] text-muted-foreground/40 font-mono">{time}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-rose-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
