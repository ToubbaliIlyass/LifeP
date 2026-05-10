'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function EventNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const date = typeof d.properties.date === 'string' ? d.properties.date : null
  const time = typeof d.properties.time === 'string' ? d.properties.time : null
  const location = typeof d.properties.location === 'string' ? d.properties.location : null
  return (
    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-amber-400" />
      <p className="text-[10px] text-amber-600 uppercase tracking-wide font-medium mb-0.5">Event</p>
      <p className="text-sm font-semibold leading-tight truncate text-amber-900 dark:text-amber-100">{d.label}</p>
      <div className="flex gap-1.5 mt-1 flex-wrap">
        {date && <span className="text-xs text-amber-600">{date}</span>}
        {time && <span className="text-xs text-amber-500">{time}</span>}
        {location && <span className="text-xs text-amber-400 truncate">@ {location}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-400" />
    </div>
  )
}
