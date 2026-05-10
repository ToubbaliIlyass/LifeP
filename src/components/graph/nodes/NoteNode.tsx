'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function NoteNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const content = typeof d.properties.content === 'string' ? d.properties.content : null
  const isJournal = typeof d.properties.date === 'string'
  return (
    <div className="relative bg-card border border-border/60 rounded-lg overflow-hidden min-w-[172px] max-w-[220px] shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-slate-400/60 dark:bg-slate-500/60" />
      <Handle type="target" position={Position.Top} className="!bg-slate-400/30 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
      <div className="pl-4 pr-3 pt-2.5 pb-2.5">
        <p className="text-[9px] text-slate-400/60 uppercase tracking-widest font-mono font-medium mb-1">
          {isJournal ? 'Journal' : 'Note'}
        </p>
        <p className="text-[13px] font-medium leading-snug text-foreground/80 line-clamp-2">{d.label}</p>
        {content && (
          <p className="text-[11px] text-muted-foreground/50 mt-1 line-clamp-2 leading-snug">{content}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400/30 !w-1.5 !h-1.5 !border-0 !min-w-0 !min-h-0" />
    </div>
  )
}
