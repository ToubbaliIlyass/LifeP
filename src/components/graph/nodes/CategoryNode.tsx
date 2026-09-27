'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { categoryCircleStyle, categoryTextStyle } from './typeStyle'

export function CategoryNode({ data }: NodeProps) {
  const d = data as { label: string; nodeType?: string }

  return (
    <div className="flex flex-col items-center select-none" style={{ width: 92 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div
        className="w-[64px] h-[64px] rounded-full border-2 flex items-center justify-center"
        style={categoryCircleStyle(d.nodeType)}
      >
        <span
          className="text-[10px] font-extrabold uppercase tracking-widest text-center leading-none px-1"
          style={categoryTextStyle(d.nodeType)}
        >
          {d.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
