'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function AssignmentNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const status = typeof d.properties.status === 'string' ? d.properties.status : 'todo'
  const dueDate = typeof d.properties.dueDate === 'string' ? d.properties.dueDate : null
  const grade = typeof d.properties.grade === 'string' ? d.properties.grade : null
  const done = status === 'graded'
  return (
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-pink-400 dark:bg-pink-500/80" />
      <Handle type="target" position={Position.Top} className="!bg-pink-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <div className="flex items-center justify-between gap-1 mb-1">
          <p className="text-[9px] text-pink-400 dark:text-pink-400/80 uppercase tracking-widest font-mono font-medium">Assignment</p>
          {grade && <span className="text-[10px] font-mono font-semibold text-emerald-400">{grade}</span>}
        </div>
        <p className={`text-[13px] font-medium leading-snug line-clamp-2 ${done ? 'line-through text-muted-foreground/50' : 'text-foreground/90'}`}>
          {d.label}
        </p>
        <div className="flex gap-2 mt-1">
          <span className="text-[9px] text-muted-foreground/50 font-mono">{status}</span>
          {dueDate && <span className="text-[9px] text-muted-foreground/40 font-mono">{dueDate}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-pink-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
