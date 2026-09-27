'use client'

import { useCallback, useEffect, useState } from 'react'
import { Repeat, X } from 'lucide-react'
import { notifyDataChanged } from '@/lib/dataSignal'

/**
 * "You keep doing these together — shall we call it a routine?"
 *
 * The app already notices when the same things are batched into one block
 * three times or more. Until now that observation had nowhere to go, so the
 * user went on rebuilding the same morning block by hand every morning.
 *
 * One click makes it, and the offer is only ever an offer: dismissing it
 * leaves everything exactly as it was.
 */

interface Offer {
  ids: number[]
  items: { id: number; type: string; name: string }[]
  times: number
  startTime: string | null
}

const FREQUENCIES = [
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['weekly', 'This day each week'],
] as const

export function RoutineOffers() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [frequency, setFrequency] = useState<Record<string, string>>({})

  const key = (offer: Offer) => offer.ids.join('-')

  const load = useCallback(() => {
    fetch('/api/routines')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { offers?: Offer[] } | null) => setOffers(d?.offers ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  async function make(offer: Offer) {
    if (busy) return
    setBusy(key(offer))
    const res = await fetch('/api/routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: offer.ids,
        startTime: offer.startTime ?? '08:00',
        frequency: frequency[key(offer)] ?? 'daily',
        label: offer.items.length ? `${offer.items[0].name} routine` : 'Routine',
      }),
    }).catch(() => null)
    setBusy(null)
    if (!res?.ok) return
    setDismissed((d) => [...d, key(offer)])
    notifyDataChanged()
  }

  const visible = offers.filter((o) => !dismissed.includes(key(o)))
  if (visible.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-[11px] font-medium uppercase tracking-widest mb-2 text-primary/60">
        Noticed a routine
      </p>
      <div className="space-y-2">
        {visible.map((offer) => (
          <div key={key(offer)} className="border border-border/60 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <Repeat className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-foreground/90">
                  {offer.items.map((i) => i.name).join(', ')}
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">
                  done together {offer.times} times
                  {offer.startTime && ` · usually around ${offer.startTime}`}
                </p>
              </div>
              <button
                onClick={() => setDismissed((d) => [...d, key(offer)])}
                aria-label="Not a routine"
                title="Not a routine"
                className="shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <select
                value={frequency[key(offer)] ?? 'daily'}
                onChange={(e) => setFrequency((f) => ({ ...f, [key(offer)]: e.target.value }))}
                aria-label="How often this routine runs"
                className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {FREQUENCIES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                onClick={() => make(offer)}
                disabled={busy === key(offer)}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40 disabled:opacity-50"
              >
                {busy === key(offer) ? 'making…' : 'Make it a routine'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
