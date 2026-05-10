'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function ConceptNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const pattern = typeof d.properties.pattern === 'string' ? d.properties.pattern : null
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-zinc-400" />
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium mb-0.5">
        Concept
      </p>
      <p className="text-sm font-medium leading-tight truncate text-zinc-800 dark:text-zinc-200">
        {d.label}
      </p>
      {pattern && (
        <p className="text-[10px] text-zinc-400 mt-1 truncate">#{pattern}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-400" />
    </div>
  )
}
