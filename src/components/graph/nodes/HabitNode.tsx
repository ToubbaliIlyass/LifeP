'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { leafCircleStyle } from './typeStyle'

export function HabitNode({ data }: NodeProps) {
  const d = data as { label: string; nodeType?: string }
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 104 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className="w-[46px] h-[46px] rounded-full border" style={leafCircleStyle(d.nodeType ?? 'habit')} />
      <p className="text-[10px] font-medium text-foreground/70 text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full">
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
