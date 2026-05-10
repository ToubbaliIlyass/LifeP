'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function NoteNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const content = typeof d.properties.content === 'string' ? d.properties.content : null
  const isJournal = typeof d.properties.date === 'string'
  return (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mb-0.5">
        {isJournal ? 'Journal' : 'Note'}
      </p>
      <p className="text-sm font-medium leading-tight truncate text-slate-800 dark:text-slate-200">{d.label}</p>
      {content && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-snug">{content}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}
