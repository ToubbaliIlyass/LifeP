'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function ExamNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const done = d.properties.status === 'taken' || d.properties.status === 'graded'
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 104 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className={`w-[46px] h-[46px] rounded-full border ${done ? 'bg-muted/40 border-border/30' : 'bg-rose-300/80 dark:bg-rose-400/50 border-rose-300/50'}`}
        style={done ? {} : { boxShadow: '0 0 6px oklch(0.68 0.19 10 / 18%)' }} />
      <p className={`text-[10px] font-medium text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full ${done ? 'line-through text-muted-foreground/65' : 'text-foreground/70'}`}>
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
