'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function NoteNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const isJournal = typeof d.properties.date === 'string'
  return (
    <div className="flex flex-col items-center select-none" style={{ width: 104 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div className={`w-[46px] h-[46px] rounded-full bg-slate-300/70 dark:bg-slate-400/40 border border-slate-300/40 ${isJournal ? 'border-dashed' : ''}`}
        style={{ boxShadow: '0 0 5px oklch(0.67 0.04 225 / 15%)' }} />
      <p className="text-[10px] font-medium text-foreground/70 text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full">
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
