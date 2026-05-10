'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function HabitNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const frequency = typeof d.properties.frequency === 'string' ? d.properties.frequency : null
  const streak = typeof d.properties.streak === 'number' ? d.properties.streak : null
  return (
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-400 dark:bg-emerald-500/80" />
      <Handle type="target" position={Position.Top} className="!bg-emerald-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <div className="flex items-center justify-between gap-1 mb-1">
          <p className="text-[9px] text-emerald-400 dark:text-emerald-400/80 uppercase tracking-widest font-mono font-medium">Habit</p>
          {streak !== null && streak > 0 && (
            <span className="text-[10px] text-orange-400/80 font-mono">🔥{streak}</span>
          )}
        </div>
        <p className="text-[13px] font-medium leading-snug text-foreground/90 line-clamp-2">{d.label}</p>
        {frequency && (
          <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">{frequency}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400/50 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
