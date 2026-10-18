'use client'

import { useState } from 'react'
import { Bell, MapPin, Trash2 } from 'lucide-react'
import type { DayEvent } from '@/lib/todos'
import { DAY_LABELS, DAY_NAMES, DAY_ORDER } from '@/lib/days'
import { toMinutes } from '@/lib/schedule'
import { askForNotifications } from '@/lib/notify'

/** When an event reminds you, as one choice: "start" is at its time, a number is minutes before. */
const REMIND = [['', 'No reminder'], ['start', 'When it starts'], ['10', '10 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']] as const

const FIELD = 'w-full rounded-md bg-foreground/[0.05] px-2 py-1 text-[13.5px] leading-5 outline-none focus:ring-1 focus:ring-primary'
const LABEL = 'block mb-0.5 text-[11.5px] font-medium text-muted-foreground'

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
  const [busy, setBusy] = useState(false)
  const [remind, setRemind] = useState<string>(event.remindBefore ? String(event.remindBefore) : event.reminder && event.reminder === event.time ? 'start' : '')
  const repeating = event.frequency !== 'once'
  /** The reminder as the route takes it: one of the two fields, the other cleared. */
  const reminderBody = () => remind === 'start' ? { reminder: time || null, remindBefore: null }
    : remind ? { reminder: null, remindBefore: Number(remind) }
    : { reminder: null, remindBefore: null }

  async function send(method: 'PATCH' | 'DELETE') {
    setBusy(true)
    const res = await fetch(`/api/events/${event.id}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'PATCH' ? { body: JSON.stringify({ name, date, time: time || null, duration, location, frequency, daysOfWeek: days, ...reminderBody() }) } : {}),
    }).catch(() => null)
    setBusy(false)
    onDone(!!res?.ok)
  }

  const durations = [...new Set([15, 30, 45, 60, 90, 120, 180, 240, 480, duration])].sort((a, b) => a - b)

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) void send('PATCH') }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(false) } }}
      className="w-[260px] p-1.5 space-y-2 text-[13.5px]"
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className={`${FIELD} font-medium`} />
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={LABEL}>{repeating ? 'From' : 'Day'}</span>
          <input type="date" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value) }} className={`${FIELD} tabular-nums`} />
        </label>
        <label>
          <span className={LABEL}>At</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${FIELD} tabular-nums`} />
        </label>
        <label>
          <span className={LABEL}>For</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={FIELD}>
            {durations.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${+(m / 60).toFixed(2)} h`}</option>)}
          </select>
        </label>
        <label>
          <span className={LABEL}>Repeats</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={FIELD}>
            <option value="once">Never</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
      </div>
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
                className={`w-7 h-6 rounded text-[11px] font-semibold ${on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.05] text-muted-foreground'}`}
              >
                {DAY_LABELS[d]}
              </button>
            )
          })}
        </div>
      )}
      {time && (
        <label className="flex items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2">
          <Bell className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <select value={remind} onChange={(e) => { setRemind(e.target.value); if (e.target.value) askForNotifications() }} aria-label="Remind me" className="flex-1 min-w-0 bg-transparent py-1 text-[13.5px] outline-none">
            {REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2">
        <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where" aria-label="Where" className="flex-1 min-w-0 bg-transparent py-1 text-[13.5px] outline-none" />
      </label>
      {event.time && time && toMinutes(time) !== toMinutes(event.time) && repeating && (
        <p className="text-[12px] text-muted-foreground">Changes every time it comes round.</p>
      )}
      <div className="flex items-center gap-1.5 pt-0.5">
        <button type="button" onClick={() => void send('DELETE')} disabled={busy} aria-label="Delete event" title={repeating ? 'Delete it, every time it comes round' : 'Delete'} className="grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:text-red-500 hover:bg-foreground/[0.05]">
          <Trash2 className="w-4 h-4" />
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => onDone(false)} className="rounded-md px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-foreground/[0.05]">Cancel</button>
        <button type="submit" disabled={!name.trim() || busy} className="rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[13px] font-semibold disabled:opacity-50">Save</button>
      </div>
    </form>
  )
}
