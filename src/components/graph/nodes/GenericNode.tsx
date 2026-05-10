'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function GenericNode({ data }: NodeProps) {
  const d = data as { label: string }
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 90 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className="w-[38px] h-[38px] rounded-full bg-muted/60 border border-border/50" />
      <p className="text-[9px] font-medium text-muted-foreground/60 text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full">
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
