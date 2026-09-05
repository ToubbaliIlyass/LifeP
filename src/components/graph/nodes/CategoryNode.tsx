'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

// text carries a light/dark split (was a fixed light shade meant only for
// dark backgrounds — in light mode it was nearly invisible against the
// equally-pale bg, the same bug fixed earlier for leaf-node labels). Glow
// blur/opacity trimmed down — the combination of saturated fill + wide
// glow was what read as "neon" rather than the pastel look intended.
const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  goal:         { bg: 'bg-violet-300/40 dark:bg-violet-500/20',  border: 'border-violet-400/50',  text: 'text-violet-700 dark:text-violet-300',  glow: 'oklch(0.67 0.22 295 / 16%)' },
  habit:        { bg: 'bg-emerald-300/40 dark:bg-emerald-500/20', border: 'border-emerald-400/50', text: 'text-emerald-700 dark:text-emerald-300', glow: 'oklch(0.74 0.17 163 / 16%)' },
  task:         { bg: 'bg-sky-300/40 dark:bg-sky-500/20',     border: 'border-sky-400/50',     text: 'text-sky-700 dark:text-sky-300',     glow: 'oklch(0.74 0.16 232 / 16%)' },
  event:        { bg: 'bg-amber-300/40 dark:bg-amber-500/20',   border: 'border-amber-400/50',   text: 'text-amber-700 dark:text-amber-300',   glow: 'oklch(0.82 0.16 84  / 16%)' },
  course:       { bg: 'bg-indigo-300/40 dark:bg-indigo-500/20',  border: 'border-indigo-400/50',  text: 'text-indigo-700 dark:text-indigo-300',  glow: 'oklch(0.65 0.19 266 / 16%)' },
  assignment:   { bg: 'bg-pink-300/40 dark:bg-pink-500/20',    border: 'border-pink-400/50',    text: 'text-pink-700 dark:text-pink-300',    glow: 'oklch(0.72 0.17 342 / 16%)' },
  exam:         { bg: 'bg-rose-300/40 dark:bg-rose-500/20',    border: 'border-rose-400/50',    text: 'text-rose-700 dark:text-rose-300',    glow: 'oklch(0.68 0.19 10  / 16%)' },
  note:         { bg: 'bg-slate-300/40 dark:bg-slate-500/20',   border: 'border-slate-400/50',   text: 'text-slate-700 dark:text-slate-300',   glow: 'oklch(0.67 0.04 225 / 14%)' },
  journalentry: { bg: 'bg-slate-300/40 dark:bg-slate-500/20',   border: 'border-slate-400/50',   text: 'text-slate-700 dark:text-slate-300',   glow: 'oklch(0.67 0.04 225 / 14%)' },
  concept:      { bg: 'bg-zinc-300/40 dark:bg-zinc-500/20',    border: 'border-zinc-400/40',    text: 'text-zinc-700 dark:text-zinc-400',    glow: 'oklch(0.6 0 0 / 12%)' },
  project:      { bg: 'bg-teal-300/40 dark:bg-teal-500/20',    border: 'border-teal-400/50',    text: 'text-teal-700 dark:text-teal-300',    glow: 'oklch(0.70 0.14 183 / 16%)' },
}

const DEFAULT = { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground', glow: 'oklch(0.5 0 0 / 15%)' }

export function CategoryNode({ data }: NodeProps) {
  const d = data as { label: string; nodeType?: string }
  const c = (d.nodeType ? TYPE_COLORS[d.nodeType] : null) ?? DEFAULT

  return (
    <div className="flex flex-col items-center select-none" style={{ width: 92 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
      <div
        className={`w-[64px] h-[64px] rounded-full border-2 ${c.bg} ${c.border} flex items-center justify-center`}
        style={{ boxShadow: `0 0 0 3px ${c.glow}, 0 0 10px ${c.glow}` }}
      >
        <span className={`text-[10px] font-extrabold uppercase tracking-widest text-center leading-none px-1 ${c.text}`}>
          {d.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0" />
    </div>
  )
}
