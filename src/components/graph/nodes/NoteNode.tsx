'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function NoteNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const isJournal = typeof d.properties.date === 'string'
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 90 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className={`w-[38px] h-[38px] rounded-full bg-slate-500/60 dark:bg-slate-400/50 border border-slate-300/30 ${isJournal ? 'border-dashed' : ''}`}
        style={{ boxShadow: '0 0 8px oklch(0.67 0.04 225 / 25%)' }} />
      <p className="text-[9px] font-medium text-foreground/70 text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full">
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
