'use client'

import { useEffect, useRef, useState } from 'react'
import { sileo } from 'sileo'
import { toastError, toastNote, toastReminder, toastStanding, toastTip, toastTuck, toastUndo } from '@/lib/toast'
import { applyMode, isDark, storedMode } from '@/lib/themes'

interface Demo { name: string; run: () => void }

const DEMOS: Demo[] = [
  { name: 'Added (green, Undo)', run: () => toastUndo('Added', 'Call mum, tomorrow 9:00', () => toastNote('Taken back.')) },
  { name: 'Marked attended (green, Undo)', run: () => toastUndo('Marked as attended', '“Team stand-up”', () => {}) },
  { name: 'Skipped (blue, Undo)', run: () => toastUndo('Skipped', '“Water the plants”. Next: Friday.', () => {}, 'acture-undo', 'info', 'looking') },
  { name: 'Long text (Undo)', run: () => toastUndo('Added', 'Book the dentist for a check-up, then ring the landlord about the boiler and the broken window latch', () => {}) },
  { name: 'Tick thanks (green)', run: () => toastTuck('One down. That was the hard one.', { pose: 'task-done', chip: { text: '+1 a runner', color: '#f5a623' } }) },
  { name: 'All done (green)', run: () => toastTuck('All clear. The garden is tidy.', { pose: 'all-done' }) },
  { name: 'Something new (violet, action)', run: () => toastTuck('Ooh, something new showed up.', { pose: 'curious', action: { label: 'Take a look', run: () => {} } }) },
  { name: 'Tip (blue, action)', run: () => toastTip({ title: 'Say it, don’t type it', body: 'Press Tell Tuck and say what’s on your plate. It becomes to-dos on the right days.' }, { label: 'Try it', run: () => {} }) },
  { name: 'Reminder (red, actions)', run: () => toastReminder('lab-reminder', 'Call the dentist', 'Today, 3:00 PM', [{ label: 'Done', primary: true, run: () => {} }, { label: 'Skip today', run: () => {} }, { label: 'Snooze 10 min', run: () => {} }]) },
  { name: 'Nothing to skip (red, note)', run: () => toastNote('Nothing to skip to', '“Pay rent” is on its last time round.', 'acture-note', 'warning') },
  { name: 'Save failed (red)', run: () => toastTuck('Oops, that didn’t work. Let’s try again.', { pose: 'error' }) },
  { name: 'Import failed (red)', run: () => toastError('Import failed', 'That is not a valid Acture export file.') },
  { name: 'Offline (blue, stays)', run: () => toastStanding('lab-offline', 'offline', 'Offline, but cosy. I’ll keep everything safe.') },
  { name: 'Saving (grey, stays)', run: () => toastStanding('lab-saving', 'syncing', 'Saving, one moment.') },
  { name: 'Imported (green)', run: () => toastNote('Imported', '42 nodes and 57 edges.', 'acture-import', 'success') },
  { name: 'Undo result (blue)', run: () => toastNote('Taken back.') },
]

const GAP_MS = 7000

export function ToastLab() {
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(-1)
  const [dark, setDark] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDark(isDark(storedMode())), 0); return () => clearTimeout(t) }, [])
  const setMode = (d: boolean) => { applyMode(d ? 'dark' : 'light'); setDark(d) }
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; setPlaying(false); setAt(-1) }
  const playAll = () => {
    stop()
    setPlaying(true)
    DEMOS.forEach((d, i) => {
      timers.current.push(setTimeout(() => { setAt(i); sileo.clear(); setTimeout(d.run, 120) }, i * GAP_MS))
    })
    timers.current.push(setTimeout(() => { setPlaying(false); setAt(-1) }, DEMOS.length * GAP_MS))
  }

  useEffect(() => { const t = setTimeout(playAll, 400); return () => { clearTimeout(t); timers.current.forEach(clearTimeout); sileo.clear() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <h1 className="text-xl font-semibold">Toasts</h1>
      <p className="mt-1 text-muted-foreground">Plays each one in turn, {GAP_MS / 1000}s apart. Tap any to see it alone. Resize to phone width to see the top placement.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={playAll} className="h-11 rounded-full bg-primary px-5 font-medium text-primary-foreground">{playing ? 'Restart' : 'Play all'}</button>
        {playing && <button onClick={stop} className="h-11 rounded-full border border-border px-5">Stop</button>}
        <div className="ml-auto flex rounded-full border border-border p-1">
          {([false, true] as const).map((d) => (
            <button key={String(d)} onClick={() => setMode(d)} className={`h-9 rounded-full px-4 ${dark === d ? 'bg-primary text-primary-foreground' : ''}`}>{d ? 'Dark' : 'Light'}</button>
          ))}
        </div>
      </div>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {DEMOS.map((d, i) => (
          <li key={d.name}>
            <button onClick={() => { stop(); sileo.clear(); setTimeout(d.run, 120) }} className={`h-11 w-full rounded-xl border px-4 text-left ${at === i ? 'border-primary bg-foreground/[0.05]' : 'border-border/70'}`}>
              <span className="tabular-nums text-muted-foreground">{i + 1}. </span>{d.name}
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
