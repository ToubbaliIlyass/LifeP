'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-violet-200 text-violet-700 dark:bg-violet-800 dark:text-violet-300',
  completed: 'bg-emerald-200 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300',
  paused:    'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
}

export function GoalNode({ data }: NodeProps) {
  const d = data as { label: string; properties: Record<string, unknown> }
  const description = typeof d.properties.description === 'string' ? d.properties.description : null
  const status = typeof d.properties.status === 'string' ? d.properties.status : null
  const targetDate = typeof d.properties.targetDate === 'string' ? d.properties.targetDate : null

  return (
    <div className="bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-xl px-3 py-2 shadow-sm min-w-[160px] max-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-violet-400" />
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <p className="text-[10px] text-violet-500 uppercase tracking-wide font-medium">Goal</p>
        {status && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'}`}>
            {status}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold leading-tight truncate text-violet-900 dark:text-violet-100">
        {d.label}
      </p>
      {description && (
        <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 line-clamp-2 leading-snug">
          {description}
        </p>
      )}
      {targetDate && (
        <p className="text-[10px] text-violet-500 mt-1">by {targetDate}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-violet-400" />
    </div>
  )
}
