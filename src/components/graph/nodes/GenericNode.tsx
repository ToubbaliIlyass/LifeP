'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function GenericNode({ data }: NodeProps) {
  const d = data as { label: string; dbNode: { type: string } }
  return (
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[160px] max-w-[210px]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-muted-foreground/30" />
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/30 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-mono font-medium mb-1">
          {d.dbNode.type}
        </p>
        <p className="text-[13px] font-medium leading-snug text-foreground/80 line-clamp-2">{d.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground/30 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
