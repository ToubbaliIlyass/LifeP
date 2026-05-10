'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function ConceptNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const pattern = typeof d.properties.pattern === 'string' ? d.properties.pattern : null
  return (
    <div className="relative bg-card border border-dashed border-border/50 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] opacity-80">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-zinc-400/50" />
      <Handle type="target" position={Position.Top} className="!bg-zinc-400/30 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <p className="text-[9px] text-zinc-400/60 uppercase tracking-widest font-mono font-medium mb-1">Concept</p>
        <p className="text-[13px] font-medium leading-snug text-foreground/70 line-clamp-2">{d.label}</p>
        {pattern && (
          <p className="text-[9px] text-muted-foreground/40 font-mono mt-1">#{pattern}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-400/30 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
