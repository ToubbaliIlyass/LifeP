'use client'

import { useEffect, useState } from 'react'
import { Check, Clock, Flag, Folder, RefreshCw, Timer } from 'lucide-react'
import { useTodos } from '@/components/todos/TodosProvider'
import { isToday, byDay, inDoneList } from '@/lib/todo-views'
import { localDateStr } from '@/lib/date'
import { wallNow } from '@/lib/wallclock'
import type { Todo, TodoList } from '@/lib/todos'
import { BTN_PRIMARY } from '@/components/ui/buttons'

const mins = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5)

/** The order to suggest things in: the next one with a time, then what matters most, then as arranged. */
export function suggestOrder(todos: Todo[], today: string, nowMin: number, lists: TodoList[] = []): Todo[] {
  const open = todos.filter((t) => !t.prayerKey && t.id > -900 && !t.done && !inDoneList(t, lists) && isToday(t, today, lists)).sort(byDay)
  const rank = (t: Todo) => {
    if (t.time && t.when === today) {
      const at = mins(t.time)
      // Still ahead, or started within the last half hour.
      return at >= nowMin - 30 ? at - nowMin : 10_000 + at
    }
    return t.priority === 'high' ? 5_000 : t.priority === 'low' ? 9_000 : 7_000
  }
  return [...open].sort((a, b) => rank(a) - rank(b))
}

/**
 * "What now?": one thing from today, with a button to do it, so opening the app is never a list to
 * decide from. "Another" moves to the next suggestion; finishing it brings the next.
 *
 * Under the title, what is known about it (when, how long, which list, whether it matters), and along
 * the bottom edge how far through today's to-dos you are: a quiet line that fills as the day goes.
 */
export function WhatsNext({ date }: { date: string }) {
  const { todos, lists, toggle } = useTodos()
  const [skip, setSkip] = useState(0)
  const [now, setNow] = useState(() => wallNow())
  useEffect(() => {
    const id = setInterval(() => setNow(wallNow()), 60_000)
    return () => clearInterval(id)
  }, [])
  const order = suggestOrder(todos, date, now.getHours() * 60 + now.getMinutes(), lists)
  if (order.length === 0) return null
  const t = order[skip % order.length]

  // Today's own: what is still open, and what was finished today (not the old ones that happen to be dated earlier).
  const finished = todos.filter((x) => !x.prayerKey && x.done && x.doneAt && localDateStr(new Date(x.doneAt)) === date && isToday(x, date, lists)).length
  const total = order.length + finished
  const pct = Math.round((finished / total) * 100)
  const list = t.listId !== null ? lists.find((l) => l.id === t.listId) : undefined

  const chips: { key: string; icon: React.ReactNode; text: string; tone?: string }[] = []
  if (t.time && t.when === date) chips.push({ key: 'time', icon: <Clock className="h-3.5 w-3.5" />, text: t.time })
  if (t.minutes) chips.push({ key: 'min', icon: <Timer className="h-3.5 w-3.5" />, text: `${t.minutes} min` })
  if (list) chips.push({ key: 'list', icon: <Folder className="h-3.5 w-3.5" />, text: list.title || (list.kind === 'project' ? 'Untitled project' : 'Untitled area') })
  if (t.priority === 'high') chips.push({ key: 'high', icon: <Flag className="h-3.5 w-3.5" />, text: 'Matters', tone: 'text-amber-700 dark:text-amber-300' })

  return (
    <section
      aria-label="What to do now"
      className="mb-4 w-full overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.15] to-primary/[0.05] shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
    >
      <div className="flex items-center gap-3 px-4 py-3 max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-2.5 max-md:px-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0 self-start mt-2" aria-hidden title={`${order.length} left today`}>
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        {/* The whole title wraps; what is known about it sits under it. */}
        <div className="min-w-0 flex-1 max-md:min-w-[calc(100%-1.5rem)]">
          <p className="text-[length:calc(16px*var(--ts))] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
            <span className="mr-2 text-[length:calc(12px*var(--ts))] font-semibold uppercase tracking-wider text-primary-ink max-md:text-[length:calc(11px*var(--ts))]">Now</span>
            {t.title || 'Untitled'}
          </p>
          <ul className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:calc(12.5px*var(--ts))] font-medium text-foreground/70">
            {chips.map((c) => (
              <li key={c.key} className={`inline-flex max-w-full items-center gap-1 rounded-full bg-background/70 px-2 py-1 leading-none ${c.tone ?? ''}`}>
                {c.icon}<span className="truncate tabular-nums">{c.text}</span>
              </li>
            ))}
            <li className="text-muted-foreground tabular-nums">{order.length} left</li>
          </ul>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-md:w-full">
        {order.length > 1 && (
          <button
            onClick={() => setSkip((n) => n + 1)}
            aria-label="Suggest another"
            title="Something else"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-2.5 text-muted-foreground transition hover:bg-foreground/[0.07] hover:text-foreground active:scale-95 max-md:h-11 max-md:w-11 max-md:px-0"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => { toggle(t); setSkip(0) }}
          className={`${BTN_PRIMARY} shrink-0 max-md:flex-1`}
        >
          <Check className="h-4 w-4" strokeWidth={3} /> Done
        </button>
        </div>
      </div>
      {/* How far through today's to-dos. */}
      <div role="progressbar" aria-label="Today's progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished} className="h-1 bg-primary/15">
        <div className="h-full rounded-r-full bg-primary transition-[width] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </section>
  )
}
