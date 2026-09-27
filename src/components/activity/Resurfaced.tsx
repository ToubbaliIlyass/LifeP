'use client'

import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Check, X } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { notifyDataChanged } from '@/lib/dataSignal'
import type { ResurfaceItem, ResurfaceKind } from '@/lib/resurface'

/**
 * Things that have gone quiet, offered back.
 *
 * The counterpart to the weekly review, which only ever looks at the week
 * just gone: this looks at everything that has *not* happened for a while.
 * Two answers, both one click — still on it, or not any more — because a
 * review people have to think hard about is a review they stop doing.
 */

const KIND_COLOR: Record<ResurfaceKind, string> = {
  goal: 'text-violet-600/70 dark:text-violet-400/60',
  project: 'text-sky-600/70 dark:text-sky-400/60',
  course: 'text-indigo-600/70 dark:text-indigo-400/60',
  task: 'text-slate-600/70 dark:text-slate-400/60',
  note: 'text-amber-600/70 dark:text-amber-400/60',
  habit: 'text-emerald-600/70 dark:text-emerald-400/60',
  content: 'text-rose-600/70 dark:text-rose-400/60',
  other: 'text-muted-foreground/60',
}

interface ResurfacedProps {
  /** Today shows a short preview; Activity shows the lot. */
  limit?: number
  /** Shown on the preview, to send the reader to the full list. */
  onSeeAll?: () => void
}

export function Resurfaced({ limit, onSeeAll }: ResurfacedProps) {
  const [items, setItems] = useState<ResurfaceItem[]>([])
  const [days, setDays] = useState(21)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(() => {
    fetch('/api/resurface')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: ResurfaceItem[]; days: number; total: number } | null) => {
        if (d) { setItems(d.items ?? []); setDays(d.days); setTotal(d.total ?? 0) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function answer(item: ResurfaceItem, action: 'keep' | 'dismiss') {
    if (busy !== null) return
    setBusy(item.id)
    // Removed on the spot: the answer is recorded against the node, and
    // re-fetching the list only to watch the same row disappear is slower
    // and shiftier than just taking it out.
    setItems((current) => current.filter((i) => i.id !== item.id))
    setTotal((t) => Math.max(0, t - 1))
    await fetch('/api/resurface', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: item.id, action }),
    }).catch(() => {})
    setBusy(null)
    notifyDataChanged()
  }

  if (loading || items.length === 0) return null

  const shown = limit ? items.slice(0, limit) : items
  const hidden = total - shown.length

  return (
    <div className="mb-2 border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/10">
        <p className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest flex items-center gap-1.5">
          <RotateCcw className="w-3 h-3" /> Worth another look
        </p>
        <span className="text-[10px] font-mono text-muted-foreground/50">
          quiet for {days}+ days
        </span>
      </div>

      <ul className="divide-y divide-border/30">
        {shown.map((item) => (
          <li key={item.id} className="group flex items-start gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <button
                onClick={() => setOpenId(item.id)}
                className="block w-full text-left text-[13px] text-foreground/85 truncate hover:text-foreground"
              >
                {item.name}
              </button>
              <p className="text-[10px] font-mono text-muted-foreground/55 mt-0.5 truncate">
                <span className={KIND_COLOR[item.kind]}>{item.type}</span>
                <span className="mx-1.5 opacity-40">·</span>
                {item.reason}
              </p>
            </div>

            {/* Always visible on touch, where there is no hover to reveal them. */}
            <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                onClick={() => answer(item, 'keep')}
                disabled={busy !== null}
                title="Still on it — ask me again later"
                aria-label={`Keep ${item.name}`}
                className="p-1.5 rounded-md text-muted-foreground/70 hover:text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => answer(item, 'dismiss')}
                disabled={busy !== null}
                title="Stop surfacing this"
                aria-label={`Stop surfacing ${item.name}`}
                className="p-1.5 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {(hidden > 0 || onSeeAll) && (
        <div className="px-4 py-2.5 border-t border-border/30 flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {hidden > 0 ? `${hidden} more waiting` : 'that’s everything'}
          </span>
          {onSeeAll && (
            <button onClick={onSeeAll} className="text-[10px] font-mono text-muted-foreground/65 hover:text-foreground transition-colors">
              review all →
            </button>
          )}
        </div>
      )}

      {openId !== null && (
        <NodeDetailPanel
          nodeId={openId}
          onClose={() => setOpenId(null)}
          onMutated={() => { setOpenId(null); load(); notifyDataChanged() }}
        />
      )}
    </div>
  )
}
