'use client'

import { useCallback, useEffect, useState } from 'react'
import { Archive, ChevronDown, Undo2 } from 'lucide-react'
import { notifyDataChanged } from '@/lib/dataSignal'
import { toastError, toastNote } from '@/lib/toast'

interface Month { month: string; count: number }
interface Item { id: number; kind: 'todo' | 'project'; title: string; day: string; place: string | null }

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const dayName = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * What was finished more than a month ago (src/lib/archive.ts). The app does
 * not load it: it is counted, and fetched here only when opened, a month at a
 * time. Anything can be put back, one at a time or a whole month, and what is
 * put back stays back.
 */
export function LogbookArchive({ count }: { count: number }) {
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState<Month[] | null>(null)
  const [month, setMonth] = useState<string | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState(false)

  const loadMonths = useCallback(async () => {
    const res = await fetch('/api/archive').catch(() => null)
    if (!res?.ok) { toastError('Couldn’t open the archive', 'Check your connection and try again.', 'acture-archive'); return }
    setMonths(((await res.json()) as { months: Month[] }).months)
  }, [])

  const loadItems = useCallback(async (m: string) => {
    const res = await fetch(`/api/archive?month=${m}`).catch(() => null)
    if (!res?.ok) { toastError('Couldn’t open that month', 'Check your connection and try again.', 'acture-archive'); return }
    setItems(((await res.json()) as { items: Item[] }).items)
  }, [])

  // Fetched on opening, and again whenever the count moves (something restored here or on another device).
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void loadMonths(), 0)
    return () => clearTimeout(t)
  }, [open, count, loadMonths])
  useEffect(() => {
    if (!open || !month) return
    const t = setTimeout(() => void loadItems(month), 0)
    return () => clearTimeout(t)
  }, [open, month, count, loadItems])

  async function restore(body: { ids: number[] } | { month: string }, what: string) {
    if (busy) return
    setBusy(true)
    const res = await fetch('/api/archive/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setBusy(false)
    if (!res?.ok) { toastError('Couldn’t put that back', 'Nothing was changed.', 'acture-archive'); return }
    toastNote('Put back', `${what} is in the Logbook again.`, 'acture-archive', 'success')
    notifyDataChanged()
  }

  if (count === 0) return null
  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-9 items-center gap-1.5 text-[length:calc(13px*var(--ts))] font-medium text-muted-foreground hover:text-foreground max-md:min-h-11"
      >
        <Archive className="h-[15px] w-[15px]" />
        Archive · {count} finished over a month ago
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1">
          {months === null && <p className="py-2 text-[length:calc(13px*var(--ts))] text-muted-foreground">Opening the archive…</p>}
          {months?.map((m) => (
            <div key={m.month}>
              <button
                type="button"
                onClick={() => { setItems(null); setMonth((cur) => (cur === m.month ? null : m.month)) }}
                aria-expanded={month === m.month}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-1 text-left text-[length:calc(14px*var(--ts))] font-semibold hover:bg-foreground/[0.04] max-md:min-h-12"
              >
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${month === m.month ? '' : '-rotate-90'}`} />
                <span className="flex-1">{monthName(m.month)}</span>
                <span className="tabular-nums text-muted-foreground font-medium">{m.count}</span>
              </button>
              {month === m.month && (
                <div className="mb-2 ml-5">
                  {items === null && <p className="py-2 text-[length:calc(13px*var(--ts))] text-muted-foreground">Opening…</p>}
                  <ul>
                    {items?.map((it) => (
                      <li key={it.id} className="flex min-h-11 items-center gap-3 border-b border-border/40 py-1.5 last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[length:calc(14px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))]">
                            {it.kind === 'project' && <span className="mr-1.5 text-muted-foreground">Project</span>}{it.title}
                          </p>
                          <p className="truncate text-[length:calc(12px*var(--ts))] text-muted-foreground">{dayName(it.day)}{it.place ? ` · ${it.place}` : ''}</p>
                        </div>
                        <button
                          type="button" disabled={busy} onClick={() => restore({ ids: [it.id] }, `“${it.title}”`)}
                          aria-label={`Put “${it.title}” back in the Logbook`}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[length:calc(12.5px*var(--ts))] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50 max-md:min-h-11 max-md:px-3"
                        >
                          <Undo2 className="h-3.5 w-3.5" />Put back
                        </button>
                      </li>
                    ))}
                  </ul>
                  {items && items.length > 1 && (
                    <button
                      type="button" disabled={busy} onClick={() => restore({ month: m.month }, `All of ${monthName(m.month)}`)}
                      className="mt-1 text-[length:calc(12.5px*var(--ts))] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50 max-md:min-h-11"
                    >
                      Put the whole month back
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
