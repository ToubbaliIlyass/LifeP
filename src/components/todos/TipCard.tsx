'use client'

import { Lightbulb, X } from 'lucide-react'
import { startListening } from '@/components/today/TodayAssistant'
import { Tuck } from '@/components/ui/Tuck'
import { BTN_PRIMARY } from '@/components/ui/buttons'
import type { Tip } from '@/lib/tips'

/**
 * A tip from the bank (src/lib/tips.ts), in the slot at the top of Today where
 * the Now card usually is. Rare on purpose; "Not now" puts it away.
 */
export function TipCard({ tip, onAway }: { tip: Tip; onAway: () => void }) {
  const act = () => {
    if (!tip.action) return
    onAway()
    if (tip.action.kind === 'listen') startListening()
    else window.location.hash = tip.action.to
  }
  return (
    <section aria-label="A tip" data-tip={tip.id} className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] to-primary/[0.04] py-3 pl-3 pr-2 max-md:grid max-md:grid-cols-[3.5rem_1fr_auto] max-md:items-start max-md:gap-x-3">
      <Tuck state="explaining" size={120} decorative className="shrink-0 max-md:!h-auto max-md:!w-14 max-md:aspect-[320/300]" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[length:calc(11.5px*var(--ts))] font-semibold uppercase tracking-wider text-primary-ink">
          <Lightbulb className="h-3.5 w-3.5" /> Tip
        </p>
        <p className="mt-0.5 text-[length:calc(16px*var(--ts))] font-semibold leading-snug tracking-tight">{tip.title}</p>
        <p className="mt-0.5 text-[length:calc(14px*var(--ts))] leading-snug text-foreground/75">{tip.body}</p>
        {tip.action && <button onClick={act} className={`${BTN_PRIMARY} mt-2.5`}>{tip.action.label}</button>}
      </div>
      <button onClick={onAway} title="Not now" aria-label="Not now" className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground max-md:h-11 max-md:w-11">
        <X className="h-4 w-4" />
      </button>
    </section>
  )
}
