'use client'

import { Select } from '@/components/ui/Select'
import { useState } from 'react'
import { Bell, MapPin, Trash2 } from 'lucide-react'
import type { DayEvent } from '@/lib/todos'
import { DAY_LABELS, DAY_NAMES, DAY_ORDER } from '@/lib/days'
import { toMinutes } from '@/lib/schedule'
import { askForNotifications } from '@/lib/notify'
import { parseEntry, saysMore } from '@/lib/quick-entry'
import { AutoTextarea } from './TodoEditor'
import { todayStr } from '@/lib/date'
import { BTN_PRIMARY, BTN_GHOST } from '@/components/ui/buttons'

/** When an event reminds you, as one choice: "start" is at its time, a number is minutes before. */
const REMIND = [['', 'No reminder'], ['start', 'When it starts'], ['10', '10 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']] as const

const FIELD = 'w-full rounded-md bg-foreground/[0.05] px-2 py-1 text-[length:calc(13.5px*var(--ts))] leading-5 outline-none focus:ring-1 focus:ring-primary'
const LABEL = 'block mb-0.5 text-[length:calc(11.5px*var(--ts))] font-medium text-muted-foreground'

/**
 * An event, opened from the day it is on: everything it has, and a way to
 * delete it. Changing a repeating one changes every time it comes round.
 */
export function EventEditor({ event, onDone }: { event: DayEvent; onDone: (changed: boolean) => void }) {
  const [name, setName] = useState(event.title)
  const [date, setDate] = useState(event.firstDate ?? event.date)
  const [time, setTime] = useState(event.time ?? '')
  const [duration, setDuration] = useState(event.minutes)
  const [location, setLocation] = useState(event.location ?? '')
  const [frequency, setFrequency] = useState(event.frequency)
  const [days, setDays] = useState<number[]>(event.daysOfWeek ?? [new Date(event.date + 'T00:00:00').getDay()])
  const [until, setUntil] = useState(event.until ?? '')
  const [busy, setBusy] = useState(false)
  const [remind, setRemind] = useState<string>(event.remindBefore ? String(event.remindBefore) : event.reminder && event.reminder === event.time ? 'start' : '')
  const repeating = event.frequency !== 'once'
  /** The reminder as the route takes it: one of the two fields, the other cleared. */
  const reminderBody = () => remind === 'start' ? { reminder: time || null, remindBefore: null }
    : remind ? { reminder: null, remindBefore: Number(remind) }
    : { reminder: null, remindBefore: null }

  /**
   * The name is a line like any other: "Lab from 2pm till 3:30pm every tue
   * ending dec 11" adds what it says to the fields below, and only what it
   * says. Shown as chips while it is typed; "keep the words" turns it off.
   */
  const [literal, setLiteral] = useState(false)
  const said = !literal && name !== event.title ? parseEntry(name, todayStr()) : null
  const entry = said && saysMore(said) ? said : null

  async function send(method: 'PATCH' | 'DELETE') {
    setBusy(true)
    const e = entry
    const body = {
      name: e?.title || name,
      date: e?.when ?? date,
      time: (e?.time ?? time) || null,
      duration: e?.minutes ?? duration,
      location: e?.location ?? location,
      frequency: e?.repeats ?? frequency,
      daysOfWeek: e?.repeatDays ?? days,
      until: (e?.until ?? until) || null,
      // A time said in the name moves the reminder with it, as picking the time does.
      ...(e?.time && remind === 'start' ? { reminder: e.time, remindBefore: null } : reminderBody()),
    }
    const res = await fetch(`/api/events/${event.id}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {}),
    }).catch(() => null)
    setBusy(false)
    onDone(!!res?.ok)
  }

  const durations = [...new Set([15, 30, 45, 60, 90, 120, 180, 240, 480, duration])].sort((a, b) => a - b)

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) void send('PATCH') }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(false) } }}
      className="w-full max-md:w-[min(340px,calc(100vw-2.5rem))] p-1.5 space-y-2 text-[length:calc(13.5px*var(--ts))]"
    >
      <AutoTextarea autoFocus value={name} onChange={(e) => setName(e.target.value.replace(/\n/g, ' '))} aria-label="Name" placeholder="Lab from 2pm till 3:30pm every tue" className={`${FIELD} resize-none overflow-hidden [overflow-wrap:anywhere] font-medium max-md:text-[length:calc(16px*var(--ts))]`} />
      {entry && (
        <div className="flex flex-wrap items-center gap-1 text-[length:calc(12px*var(--ts))]">
          {entry.title && <span className="font-medium text-foreground/80 mr-0.5">“{entry.title}”</span>}
          {entry.pieces.map((p) => <span key={p} className="rounded-[4px] bg-primary/[0.12] text-primary px-1.5 leading-[18px] font-medium">{p}</span>)}
          <button type="button" onClick={() => setLiteral(true)} className="ml-1 text-muted-foreground hover:text-foreground underline underline-offset-2">keep the words</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={LABEL}>{repeating ? 'From' : 'Day'}</span>
          <input type="date" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value) }} className={`${FIELD} tabular-nums`} />
        </label>
        <label>
          <span className={LABEL}>At</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${FIELD} tabular-nums`} />
        </label>
        <div>
          <span className={LABEL}>For</span>
          <Select value={String(duration)} onChange={(v) => setDuration(Number(v))} ariaLabel="How long" className={FIELD} options={durations.map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${+(m / 60).toFixed(2)} h` }))} />
        </div>
        <div>
          <span className={LABEL}>Repeats</span>
          <Select value={frequency} onChange={setFrequency} ariaLabel="Repeats" className={FIELD} options={[{ value: 'once', label: 'Never' }, { value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Weekdays' }, { value: 'weekly', label: 'Weekly' }]} />
        </div>
      </div>
      {frequency !== 'once' && (
        <label className="flex items-center gap-2">
          <span className={`${LABEL} !mb-0 shrink-0`}>Ends</span>
          <input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} className={`${FIELD} tabular-nums`} />
          {until && <button type="button" onClick={() => setUntil('')} className="shrink-0 text-[length:calc(12px*var(--ts))] text-muted-foreground hover:text-foreground underline underline-offset-2">never</button>}
        </label>
      )}
      {frequency === 'weekly' && (
        <div className="flex gap-1">
          {DAY_ORDER.map((d) => {
            const on = days.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={DAY_NAMES[d]}
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b))}
                className={`w-8 h-8 max-md:h-11 max-md:w-11 rounded-md text-[length:calc(12px*var(--ts))] max-md:text-[length:calc(14px*var(--ts))] font-semibold ${on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.05] text-muted-foreground'}`}
              >
                {DAY_LABELS[d]}
              </button>
            )
          })}
        </div>
      )}
      <div className={`grid gap-2 ${time ? 'grid-cols-2 max-sm:grid-cols-1' : ''}`}>
      {time && (
        <Select
          value={remind}
          onChange={(v) => { setRemind(v); if (v) askForNotifications() }}
          ariaLabel="Remind me"
          className={FIELD}
          icon={<Bell className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
          options={REMIND.map(([v, l]) => ({ value: v, label: l }))}
        />
      )}
      <label className="flex items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2">
        <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <AutoTextarea value={location} onChange={(e) => setLocation(e.target.value.replace(/\n/g, ' '))} placeholder="Where" aria-label="Where" className="flex-1 min-w-0 resize-none overflow-hidden [overflow-wrap:anywhere] bg-transparent py-1 text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] outline-none" />
      </label>
      </div>
      {event.time && time && toMinutes(time) !== toMinutes(event.time) && repeating && (
        <p className="text-[length:calc(12px*var(--ts))] text-muted-foreground">Changes every time it comes round.</p>
      )}
      <div className="flex items-center gap-1.5 pt-0.5">
        <button type="button" onClick={() => void send('DELETE')} disabled={busy} aria-label="Delete event" title={repeating ? 'Delete it, every time it comes round' : 'Delete'} className="grid place-items-center w-9 h-9 max-md:w-11 max-md:h-11 rounded-md text-muted-foreground hover:text-red-500 hover:bg-foreground/[0.05]">
          <Trash2 className="w-4 h-4" />
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => onDone(false)} className={`${BTN_GHOST} `}>Cancel</button>
        <button type="submit" disabled={!name.trim() || busy} className={`${BTN_PRIMARY} `}>Save</button>
      </div>
    </form>
  )
}
