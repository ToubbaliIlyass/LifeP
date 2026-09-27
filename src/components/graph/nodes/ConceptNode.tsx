'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { leafCircleStyle } from './typeStyle'

export function ConceptNode({ data }: NodeProps) {
  const d = data as { label: string; nodeType?: string }
  return (
    <div className="flex flex-col items-center select-none opacity-70" style={{ width: 104 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className="w-[40px] h-[40px] rounded-full border border-dashed" style={leafCircleStyle(d.nodeType ?? 'concept')} />
      <p className="text-[10px] font-medium text-muted-foreground/60 text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full">
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
