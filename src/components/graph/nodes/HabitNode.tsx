'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function HabitNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const frequency = typeof d.properties.frequency === 'string' ? d.properties.frequency : null
  const streak = typeof d.properties.streak === 'number' ? d.properties.streak : null
  return (
    <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-emerald-400" />
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium mb-0.5">
          Habit
        </p>
        {streak !== null && streak > 0 && (
          <span className="text-[10px] text-orange-500 font-medium">🔥{streak}</span>
        )}
      </div>
      <p className="text-sm font-semibold leading-tight truncate text-emerald-900 dark:text-emerald-100">
        {d.label}
      </p>
      {frequency && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{frequency}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400" />
    </div>
  )
}
