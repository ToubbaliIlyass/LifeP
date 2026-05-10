'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function EventNode({ data }: NodeProps) {
  const d = data as { label: string }
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 90 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className="w-[38px] h-[38px] rounded-full bg-amber-500/70 dark:bg-amber-400/60 border border-amber-300/40"
        style={{ boxShadow: '0 0 10px oklch(0.82 0.16 84 / 35%)' }} />
      <p className="text-[9px] font-medium text-foreground/70 text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full">
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
