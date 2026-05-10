'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function CourseNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const code = typeof d.properties.code === 'string' ? d.properties.code : null
  const semester = typeof d.properties.semester === 'string' ? d.properties.semester : null
  return (
    <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-indigo-400" />
      <p className="text-[10px] text-indigo-500 uppercase tracking-wide font-medium mb-0.5">Course</p>
      <p className="text-sm font-semibold leading-tight truncate text-indigo-900 dark:text-indigo-100">{d.label}</p>
      <div className="flex gap-1.5 mt-1 flex-wrap">
        {code && <span className="text-[10px] text-indigo-500 font-mono">{code}</span>}
        {semester && <span className="text-[10px] text-indigo-400">{semester}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400" />
    </div>
  )
}
