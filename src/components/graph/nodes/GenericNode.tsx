'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function GenericNode({ data }: NodeProps) {
  const d = data as { label: string; dbNode: { type: string } }
  return (
    <div className="bg-card border rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
        {d.dbNode.type}
      </p>
      <p className="text-sm font-medium leading-tight truncate">{d.label}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  )
}
