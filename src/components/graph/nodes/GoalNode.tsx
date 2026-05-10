'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function GoalNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const description = typeof d.properties.description === 'string' ? d.properties.description : null
  const status = typeof d.properties.status === 'string' ? d.properties.status : null
  const targetDate = typeof d.properties.targetDate === 'string' ? d.properties.targetDate : null

  return (
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-400 dark:bg-violet-500/80" />
      <Handle type="target" position={Position.Top} className="!bg-violet-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <div className="flex items-center justify-between gap-1 mb-1">
          <p className="text-[9px] text-violet-400 dark:text-violet-400/80 uppercase tracking-widest font-mono font-medium">Goal</p>
          {status && (
            <span className="text-[9px] text-muted-foreground/60 font-mono">{status}</span>
          )}
        </div>
        <p className="text-[13px] font-medium leading-snug text-foreground/90 line-clamp-2">{d.label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground/60 mt-1 line-clamp-2 leading-snug">{description}</p>
        )}
        {targetDate && (
          <p className="text-[10px] text-muted-foreground/50 font-mono mt-1.5">by {targetDate}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
