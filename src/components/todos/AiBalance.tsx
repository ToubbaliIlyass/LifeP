'use client'

import { useCallback, useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { money } from '@/lib/ai/cost'
import type { UsageSummary } from '@/lib/ai/usage'
import { useDataChanged } from '@/lib/dataSignal'
import { clockZone } from '@/lib/wallclock'

/**
 * A small running balance of what the AI has cost: the total at the foot of
 * the sidebar, and today, this month and what the cache saved when opened.
 * Estimated from token counts, so it is close, not a bill.
 */
export function AiBalance() {
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    const tz = clockZone()
    fetch(`/api/ai-usage${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UsageSummary | null) => { if (d) setUsage(d) })
      .catch(() => {})
  }, [])
  useEffect(load, [load])
  // The assistant changing something is the sign a call has just finished.
  useDataChanged(load)
  useEffect(() => {
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  if (!usage) return null
  const row = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-6"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}</span></div>
  )
  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-0 mb-1 w-[210px] p-3 rounded-lg border border-border/70 bg-popover shadow-xl text-[13px] space-y-1.5">
            <div className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-wide">AI spent</div>
            {row('Today', money(usage.today.usd))}
            {row('This month', money(usage.month.usd))}
            {row('All time', money(usage.total.usd))}
            <div className="pt-1.5 mt-1 border-t border-border/60 space-y-1.5">
              {row('Calls this month', String(usage.month.calls))}
              {usage.savedThisMonth > 0 && row('Saved by cache', money(usage.savedThisMonth))}
            </div>
            <p className="pt-1 text-[11.5px] leading-snug text-muted-foreground">An estimate from tokens used, not the provider’s bill.</p>
          </div>
        </>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title="What the AI has cost so far"
        aria-label={`AI spent: ${money(usage.total.usd)}`}
        aria-expanded={open}
        className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[12px] font-medium tabular-nums text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]"
      >
        <Coins className="w-3.5 h-3.5" /> {money(usage.total.usd)}
      </button>
    </div>
  )
}
