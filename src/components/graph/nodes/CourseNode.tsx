'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function CourseNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const code = typeof d.properties.code === 'string' ? d.properties.code : null
  const semester = typeof d.properties.semester === 'string' ? d.properties.semester : null
  return (
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-400 dark:bg-indigo-500/80" />
      <Handle type="target" position={Position.Top} className="!bg-indigo-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <p className="text-[9px] text-indigo-400 dark:text-indigo-400/80 uppercase tracking-widest font-mono font-medium mb-1">Course</p>
        <p className="text-[13px] font-medium leading-snug text-foreground/90 line-clamp-2">{d.label}</p>
        <div className="flex gap-2 mt-1">
          {code && <span className="text-[10px] text-muted-foreground/50 font-mono">{code}</span>}
          {semester && <span className="text-[10px] text-muted-foreground/40 font-mono">{semester}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
