'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { localDateStr } from '@/lib/date'

export interface EventDraft {
  start: Date
  end: Date
  allDay: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const field =
  'w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50'

/**
 * Creates an Event from a tapped or dragged-out stretch of the calendar.
 * A bottom sheet on a phone, a centred card elsewhere.
 */
export function NewEventDialog({
  draft,
  onClose,
  onCreated,
}: {
  draft: EventDraft
  onClose: () => void
  onCreated: (id: number, linking: boolean) => void
}) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(localDateStr(draft.start))
  const [allDay, setAllDay] = useState(draft.allDay)
  const [start, setStart] = useState(draft.allDay ? '09:00' : hm(draft.start))
  // A selection that ends at midnight belongs to the same day, not the next.
  const [end, setEnd] = useState(draft.allDay ? '10:00' : hm(draft.end) === '00:00' ? '23:59' : hm(draft.end))
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    if (!allDay && toMin(end) <= toMin(start)) {
      setError('The end has to be after the start.')
      return
    }
    setSaving(true)
    setError(null)
    const res = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        date,
        location: location || undefined,
        ...(allDay ? {} : { time: start, duration: toMin(end) - toMin(start) }),
      }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(d.error ?? 'Could not create the event.')
      return
    }
    onCreated(d.id, true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-card border border-border/60 rounded-t-2xl sm:rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl space-y-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">New event</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What's happening?"
          className="w-full bg-transparent text-[18px] border-b border-border/60 pb-2 focus:outline-none focus:border-primary/60"
        />

        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} col-span-2`} aria-label="Date" />
          {!allDay && (
            <>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={field} aria-label="Starts" />
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={field} aria-label="Ends" />
            </>
          )}
        </div>

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>

        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className={field} />

        {/* No opt-in checkbox: connecting a new event to the goal or course
            it obviously belongs to is the app doing its job, not a favour to
            ask permission for each time. Whether those links are written or
            queued as proposals is Settings → Assistant, once. */}
        <p className="text-[11px] font-mono text-muted-foreground/60 leading-relaxed">
          The assistant will link this to a goal, course or project if it clearly belongs to one.
        </p>

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="w-full text-[13px] font-semibold px-3 py-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
        >
          {saving ? 'Adding…' : 'Add to calendar'}
        </button>
      </form>
    </div>
  )
}
