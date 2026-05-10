'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  goal:         { bg: 'bg-violet-500/25',  border: 'border-violet-400/50',  text: 'text-violet-300',  glow: 'oklch(0.67 0.22 295 / 30%)' },
  habit:        { bg: 'bg-emerald-500/25', border: 'border-emerald-400/50', text: 'text-emerald-300', glow: 'oklch(0.74 0.17 163 / 30%)' },
  task:         { bg: 'bg-sky-500/25',     border: 'border-sky-400/50',     text: 'text-sky-300',     glow: 'oklch(0.74 0.16 232 / 30%)' },
  event:        { bg: 'bg-amber-500/25',   border: 'border-amber-400/50',   text: 'text-amber-300',   glow: 'oklch(0.82 0.16 84  / 30%)' },
  course:       { bg: 'bg-indigo-500/25',  border: 'border-indigo-400/50',  text: 'text-indigo-300',  glow: 'oklch(0.65 0.19 266 / 30%)' },
  assignment:   { bg: 'bg-pink-500/25',    border: 'border-pink-400/50',    text: 'text-pink-300',    glow: 'oklch(0.72 0.17 342 / 30%)' },
  exam:         { bg: 'bg-rose-500/25',    border: 'border-rose-400/50',    text: 'text-rose-300',    glow: 'oklch(0.68 0.19 10  / 30%)' },
  note:         { bg: 'bg-slate-500/25',   border: 'border-slate-400/50',   text: 'text-slate-300',   glow: 'oklch(0.67 0.04 225 / 25%)' },
  journalentry: { bg: 'bg-slate-500/25',   border: 'border-slate-400/50',   text: 'text-slate-300',   glow: 'oklch(0.67 0.04 225 / 25%)' },
  concept:      { bg: 'bg-zinc-500/20',    border: 'border-zinc-400/40',    text: 'text-zinc-400',    glow: 'oklch(0.6 0 0 / 20%)' },
  project:      { bg: 'bg-teal-500/25',    border: 'border-teal-400/50',    text: 'text-teal-300',    glow: 'oklch(0.70 0.14 183 / 30%)' },
}

const DEFAULT = { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground', glow: 'oklch(0.5 0 0 / 15%)' }

export function CategoryNode({ data }: NodeProps) {
  const d = data as { label: string; nodeType?: string }
  const c = (d.nodeType ? TYPE_COLORS[d.nodeType] : null) ?? DEFAULT

  return (
    <div className="flex flex-col items-center select-none" style={{ width: 80 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div
        className={`w-[54px] h-[54px] rounded-full border-2 ${c.bg} ${c.border} flex items-center justify-center`}
        style={{ boxShadow: `0 0 0 3px ${c.glow}, 0 0 16px ${c.glow}` }}
      >
        <span className={`text-[9px] font-extrabold uppercase tracking-widest text-center leading-none px-1 ${c.text}`}>
          {d.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
