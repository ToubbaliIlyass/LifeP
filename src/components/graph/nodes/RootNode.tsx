'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function RootNode({ data }: NodeProps) {
  const d = data as { label: string }
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 90 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div
        className="w-[72px] h-[72px] rounded-full bg-primary flex items-center justify-center"
        style={{ boxShadow: '0 0 0 4px oklch(0.74 0.14 72 / 20%), 0 0 28px oklch(0.74 0.14 72 / 40%)' }}
      >
        <span className="text-[11px] font-extrabold text-primary-foreground tracking-tight">{d.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
