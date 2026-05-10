'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function EventNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const date = typeof d.properties.date === 'string' ? d.properties.date : null
  const time = typeof d.properties.time === 'string' ? d.properties.time : null
  const location = typeof d.properties.location === 'string' ? d.properties.location : null
  return (
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400 dark:bg-amber-500/80" />
      <Handle type="target" position={Position.Top} className="!bg-amber-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <p className="text-[9px] text-amber-400 dark:text-amber-400/80 uppercase tracking-widest font-mono font-medium mb-1">Event</p>
        <p className="text-[13px] font-medium leading-snug text-foreground/90 line-clamp-2">{d.label}</p>
        <div className="flex gap-2 mt-1 flex-wrap">
          {date && <span className="text-[10px] text-muted-foreground/50 font-mono">{date}</span>}
          {time && <span className="text-[10px] text-muted-foreground/50 font-mono">{time}</span>}
          {location && <span className="text-[10px] text-muted-foreground/40 truncate">@ {location}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
