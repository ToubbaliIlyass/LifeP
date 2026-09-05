'use client'

import { useState } from 'react'
import { X, CalendarClock } from 'lucide-react'
import { todayStr } from '@/lib/date'

interface ScheduleDialogProps {
  nodeId: number
  nodeName: string
  /** Pre-fill from the task's due date, if it has one. */
  defaultDate?: string | null
  onClose: () => void
  onScheduled: () => void
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const inputClass = 'w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50'

export function ScheduleDialog({ nodeId, nodeName, defaultDate, onClose, onScheduled }: ScheduleDialogProps) {
  const [date, setDate] = useState(defaultDate || todayStr())
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState(30)
  const [saving, setSaving] = useState(false)

  async function handleSchedule() {
    setSaving(true)
    await fetch('/api/calendar/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        startTime,
        endTime: addMinutes(startTime, duration),
        sourceNodeId: nodeId,
        replaceExisting: true,
      }),
    })
    setSaving(false)
    onScheduled()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative z-10 w-full max-w-sm mx-4 bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40 shrink-0">
          <CalendarClock className="w-3.5 h-3.5 text-muted-foreground/50" />
          <p className="text-[13px] font-serif text-foreground/85 truncate flex-1">{nodeName}</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-1">Date</p>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-1">Start time</p>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-1">Duration</p>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border/40 shrink-0 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSchedule}
            disabled={saving}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Scheduling…' : 'Add to calendar'}
          </button>
        </div>
      </div>
    </div>
  )
}
