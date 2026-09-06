'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, MapPin, AlertTriangle } from 'lucide-react'
import { StatusCheckbox, CompletionCheckbox } from '@/components/ui/completion-checkbox'
import { useUndo } from '@/components/undo/UndoProvider'

import type { NowItem } from '@/lib/now'

interface Capacity {
  committedMinutes: number
  dayStart: string
  dayEnd: string
  workingMinutes: number
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function formatHours(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * One ordered answer to "what now", instead of four lists to merge.
 *
 * The current item is decided here rather than on the server: once deployed
 * the server is in UTC and has no idea what time it is where the user is.
 */
export function NowQueue({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<NowItem[]>([])
  const [capacity, setCapacity] = useState<Capacity | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  const { record } = useUndo()

  const load = useCallback(() => {
    fetch('/api/now')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: NowItem[]; capacity: Capacity } | null) => {
        if (!d) return
        setItems(d.items ?? [])
        setCapacity(d.capacity ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // The highlighted item should follow the clock without a reload.
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMinutes(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  async function complete(item: NowItem) {
    if (!item.targetId || busy !== null) return
    setBusy(item.id)

    if (item.targetType === 'Habit') {
      await fetch(`/api/habits/${item.targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
      record(`Completed "${item.label}"`, async () => {
        await fetch(`/api/habits/${item.targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: false }),
        })
        load()
        onChanged?.()
      })
    } else if (item.targetType === 'Task') {
      await fetch(`/api/tasks/${item.targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      record(`Completed "${item.label}"`, async () => {
        await fetch(`/api/tasks/${item.targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'todo' }),
        })
        load()
        onChanged?.()
      })
    }

    setBusy(null)
    load()
    onChanged?.()
  }

  if (loading || items.length === 0) return null

  // "Now" is whatever is happening at this minute; failing that, the next
  // thing with a time; failing that, the first thing without one.
  const currentIndex = (() => {
    const during = items.findIndex(
      (i) => i.startTime && i.endTime && toMinutes(i.startTime) <= nowMinutes && nowMinutes < toMinutes(i.endTime),
    )
    if (during !== -1) return during
    const upcoming = items.findIndex((i) => i.startTime && toMinutes(i.startTime) >= nowMinutes)
    if (upcoming !== -1) return upcoming
    const untimed = items.findIndex((i) => !i.startTime)
    return untimed !== -1 ? untimed : 0
  })()

  const current = items[currentIndex]
  const rest = items.filter((_, idx) => idx !== currentIndex)
  const happeningNow =
    !!current.startTime && !!current.endTime &&
    toMinutes(current.startTime) <= nowMinutes && nowMinutes < toMinutes(current.endTime)

  // Only the part of the working day that is still ahead counts as available.
  const remaining = capacity
    ? Math.max(0, toMinutes(capacity.dayEnd) - Math.max(nowMinutes, toMinutes(capacity.dayStart)))
    : 0
  const overcommitted = capacity ? capacity.committedMinutes > remaining : false

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest">
          {happeningNow ? 'Now' : 'Up next'}
        </h2>
        {capacity && capacity.committedMinutes > 0 && (
          <span className={`text-[10px] font-mono tabular-nums ${overcommitted ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/50'}`}>
            {formatHours(capacity.committedMinutes)} planned · {formatHours(remaining)} left
          </span>
        )}
      </div>

      {overcommitted && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/25">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground/75">
            More planned than the day has room for — about{' '}
            <span className="font-medium">{formatHours(capacity!.committedMinutes - remaining)}</span> too much.
            Something here will need to move or wait.
          </p>
        </div>
      )}

      {/* The one thing to do, given more weight than everything under it. */}
      <div className="rounded-xl border border-primary/35 bg-primary/[0.06] px-4 py-3.5 mb-2">
        <div className="flex items-center gap-3">
          {current.targetType === 'Habit' && (
            <button onClick={() => complete(current)} disabled={busy !== null} aria-label={`Complete ${current.label}`}>
              <CompletionCheckbox checked={false} />
            </button>
          )}
          {current.targetType === 'Task' && (
            <button onClick={() => complete(current)} disabled={busy !== null} aria-label={`Complete ${current.label}`}>
              <StatusCheckbox status="todo" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-serif text-foreground/90 truncate">{current.label}</p>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-muted-foreground/60">
              {current.startTime && <span className="tabular-nums">{current.startTime}–{current.endTime}</span>}
              {!current.startTime && current.minutes && <span>{formatHours(current.minutes)}</span>}
              {current.note && (
                <span className={current.note === 'overdue' ? 'text-destructive/80' : ''}>
                  {current.note === 'overdue' && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />}
                  {current.note}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {rest.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/25 transition-colors">
            <span className="text-[10px] font-mono text-muted-foreground/45 tabular-nums w-11 shrink-0">
              {item.startTime ?? '—'}
            </span>
            {item.targetType === 'Habit' || item.targetType === 'Task' ? (
              <button
                onClick={() => complete(item)}
                disabled={busy !== null}
                aria-label={`Complete ${item.label}`}
                className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Clock className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
            )}
            <span className="text-[13px] font-serif flex-1 truncate text-foreground/80">{item.label}</span>
            {item.note && (
              <span className={`text-[10px] font-mono shrink-0 flex items-center gap-0.5 ${item.note === 'overdue' ? 'text-destructive/70' : 'text-muted-foreground/45'}`}>
                {item.note === 'overdue' ? <AlertTriangle className="w-2.5 h-2.5" /> : item.kind === 'event' ? <MapPin className="w-2.5 h-2.5" /> : null}
                {item.note}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
