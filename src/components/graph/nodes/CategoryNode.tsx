'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

const TYPE_COLORS: Record<string, string> = {
  goal: 'bg-violet-500/20 border-violet-400/60 text-violet-300',
  habit: 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300',
  task: 'bg-sky-500/20 border-sky-400/60 text-sky-300',
  event: 'bg-amber-500/20 border-amber-400/60 text-amber-300',
  course: 'bg-indigo-500/20 border-indigo-400/60 text-indigo-300',
  assignment: 'bg-pink-500/20 border-pink-400/60 text-pink-300',
  exam: 'bg-rose-500/20 border-rose-400/60 text-rose-300',
  note: 'bg-slate-500/20 border-slate-400/60 text-slate-300',
  journalentry: 'bg-slate-500/20 border-slate-400/60 text-slate-300',
  concept: 'bg-zinc-500/20 border-zinc-400/60 text-zinc-300',
}

const DEFAULT_COLOR = 'bg-muted/40 border-border text-muted-foreground'

export function CategoryNode({ data }: NodeProps) {
  const d = data as { label: string; nodeType?: string }
  const colorClass = d.nodeType ? (TYPE_COLORS[d.nodeType] ?? DEFAULT_COLOR) : DEFAULT_COLOR

  return (
    <div
      className={`flex items-center justify-center rounded-full border ${colorClass}`}
      style={{ width: 68, height: 68, transform: 'translate(-50%, -50%)' }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-center leading-tight px-1">
        {d.label}
      </span>
      <Handle type="target" position={Position.Top} className="opacity-0 !min-w-0 !min-h-0" />
      <Handle type="source" position={Position.Top} className="opacity-0 !min-w-0 !min-h-0" id="src-top" />
      <Handle type="source" position={Position.Right} className="opacity-0 !min-w-0 !min-h-0" id="src-right" />
      <Handle type="source" position={Position.Bottom} className="opacity-0 !min-w-0 !min-h-0" id="src-bottom" />
      <Handle type="source" position={Position.Left} className="opacity-0 !min-w-0 !min-h-0" id="src-left" />
      <Handle type="target" position={Position.Right} className="opacity-0 !min-w-0 !min-h-0" id="tgt-right" />
      <Handle type="target" position={Position.Bottom} className="opacity-0 !min-w-0 !min-h-0" id="tgt-bottom" />
      <Handle type="target" position={Position.Left} className="opacity-0 !min-w-0 !min-h-0" id="tgt-left" />
    </div>
  )
}
