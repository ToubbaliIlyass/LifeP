'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function ExamNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const done = d.properties.status === 'taken' || d.properties.status === 'graded'
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 90 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className={`w-[38px] h-[38px] rounded-full border ${done ? 'bg-muted/40 border-border/30' : 'bg-rose-500/70 dark:bg-rose-400/60 border-rose-300/40'}`}
        style={done ? {} : { boxShadow: '0 0 10px oklch(0.68 0.19 10 / 35%)' }} />
      <p className={`text-[9px] font-medium text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full ${done ? 'line-through text-muted-foreground/40' : 'text-foreground/70'}`}>
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
