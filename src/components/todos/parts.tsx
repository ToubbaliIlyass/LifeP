'use client'

import { Archive, BookCheck, CalendarDays, Check, Inbox, Layers, Star } from 'lucide-react'
import type { StandardView } from '@/lib/todo-views'

/** The fixed lists: what each is called, drawn with, and coloured. */
export const VIEW_META: Record<StandardView, { title: string; Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  inbox:    { title: 'Inbox',    Icon: Inbox,        tone: 'text-sky-500' },
  today:    { title: 'Today',    Icon: Star,         tone: 'text-amber-400 fill-amber-400' },
  upcoming: { title: 'Upcoming', Icon: CalendarDays, tone: 'text-rose-500' },
  anytime:  { title: 'Anytime',  Icon: Layers,       tone: 'text-teal-500' },
  someday:  { title: 'Someday',  Icon: Archive,      tone: 'text-amber-800/80 dark:text-amber-200/70' },
  logbook:  { title: 'Logbook',  Icon: BookCheck,    tone: 'text-emerald-600 dark:text-emerald-500' },
}

export const EVENING_TONE = 'text-indigo-500 dark:text-indigo-400'
export const SOMEDAY_TONE = 'text-amber-800/80 dark:text-amber-200/70'

/** A project's progress, as a pie filling clockwise inside a ring. */
export function ProgressRing({ value, size = 16, className = '' }: { value: number; size?: number; className?: string }) {
  const C = 17.28
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" aria-hidden className={`shrink-0 ${className}`}>
      <circle cx="8" cy="8" r="7" strokeWidth="1.4" />
      <circle
        cx="8" cy="8" r="2.75" strokeWidth="5.5"
        strokeDasharray={`${(Math.max(0, Math.min(1, value)) * C).toFixed(2)} ${C}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}

/** The tick every to-do carries: a small rounded square, sitting on the title's first line. */
export function TodoCheck({ done, onClick, small = false, label }: { done: boolean; onClick: () => void; small?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      aria-label={label ?? (done ? 'Mark as not done' : 'Complete')}
      className={`shrink-0 grid place-items-center rounded-[4px] border-[1.5px] transition-colors ${
        small ? 'w-[13px] h-[13px]' : 'w-[15px] h-[15px] mt-[3.5px]'
      } ${done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/50 text-transparent hover:border-primary hover:text-muted-foreground/50'}`}
    >
      <Check className={small ? 'w-[9px] h-[9px]' : 'w-[11px] h-[11px]'} strokeWidth={3.2} />
    </button>
  )
}
