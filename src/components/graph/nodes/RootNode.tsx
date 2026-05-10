'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function RootNode({ data }: NodeProps) {
  const d = data as { label: string }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_oklch(0.74_0.14_72/0.4)]"
      style={{ width: 88, height: 88, transform: 'translate(-50%, -50%)' }}
    >
      <span className="font-extrabold text-sm text-center leading-tight px-1">{d.label}</span>
      <Handle type="source" position={Position.Top} className="opacity-0 !min-w-0 !min-h-0" />
      <Handle type="source" position={Position.Right} className="opacity-0 !min-w-0 !min-h-0" id="right" />
      <Handle type="source" position={Position.Bottom} className="opacity-0 !min-w-0 !min-h-0" id="bottom" />
      <Handle type="source" position={Position.Left} className="opacity-0 !min-w-0 !min-h-0" id="left" />
    </div>
  )
}
