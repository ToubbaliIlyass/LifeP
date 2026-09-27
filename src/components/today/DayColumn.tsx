'use client'

import { AlertTriangle, Check } from 'lucide-react'
import { StatusCheckbox } from '@/components/ui/completion-checkbox'
import { todayStr, addDays } from '@/lib/date'
import type { NowItem, TodayHabit, UpcomingTask } from '@/lib/now'

type Target = { id: number; type: string; name: string }

/** A task finished today, and when. */
export interface DoneItem { id: number; name: string; at: string }
/** What is already on tomorrow's clock. */
export interface TomorrowPlan {
  date: string
  onTheClock: { start: string | null; end: string | null; what: string; kind: string }[]
}

/**
 * Under the timeline: everything today that has no time.
 *
 *   Habits       due today and not on the calendar, as chips to tap — ticked
 *                ones stay, so the count reads as progress, not what is left
 *   No time yet  tasks due today or late, and dated module items; each one
 *                a tap away from tomorrow
 *   This week    tasks due over the next seven days, before they are today's
 *   Done         what was finished today — the day's progress, not only
 *                what is left, which by evening is almost nothing
 *   Tomorrow     in the evening: what is already on tomorrow, and due then
 *
 * Kept short and below the day rather than beside it: the timeline is what
 * is read, and this is what is glanced at.
 */
export function DayColumn({ done = [], tomorrow = null, habits, due, upcoming, busy, onMark, onOpen, onTomorrow }: {
  done?: DoneItem[]
  /** Shown only when the caller decides it is time to look ahead. */
  tomorrow?: TomorrowPlan | null
  habits: TodayHabit[]
  /** The untimed part of the Now queue, habits excepted. */
  due: NowItem[]
  upcoming: UpcomingTask[]
  busy: boolean
  onMark: (target: Target, done: boolean) => void
  onOpen: (id: number) => void
  /** Off today: what did not fit, or will not happen, goes to tomorrow. */
  onTomorrow?: (target: { id: number; name: string }) => void
}) {
  const habitsDone = habits.filter((h) => h.done).length
  // Due tomorrow is shown under Tomorrow when that is showing, not twice.
  // ...and not again when it already has a time on tomorrow's clock.
  const onTomorrowsClock = new Set(tomorrow?.onTheClock.map((c) => c.what.toLowerCase()) ?? [])
  const dueTomorrow = tomorrow
    ? upcoming.filter((t) => t.dueDate === tomorrow.date && !onTomorrowsClock.has(t.name.toLowerCase()))
    : []
  const laterThisWeek = tomorrow ? upcoming.filter((t) => t.dueDate !== tomorrow.date) : upcoming
  const tomorrowHasAnything = !!tomorrow && (tomorrow.onTheClock.length > 0 || dueTomorrow.length > 0)

  if (habits.length === 0 && due.length === 0 && upcoming.length === 0 && done.length === 0 && !tomorrowHasAnything) return null

  return (
    <div className="mt-7 pt-5 border-t border-border/40 space-y-5">
      {habits.length > 0 && (
        <Group label="Habits" count={`${habitsDone}/${habits.length}`}>
          <div className="flex flex-wrap gap-1.5">
            {habits.map((h) => (
              <button
                key={h.id}
                onClick={() => onMark({ id: h.id, type: 'Habit', name: h.name }, !h.done)}
                disabled={busy}
                aria-pressed={h.done}
                title={[h.dayPart, h.minutes ? `${h.minutes} min` : null].filter(Boolean).join(' · ') || undefined}
                className={`flex items-center gap-1.5 text-[12.5px] pl-1.5 pr-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                  h.done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-muted-foreground/70 line-through'
                    : 'border-border/60 text-foreground/80 hover:bg-muted/40'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  h.done ? 'bg-emerald-500 text-white' : 'border border-muted-foreground/40'
                }`}>
                  {h.done && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                </span>
                {h.name}
              </button>
            ))}
          </div>
        </Group>
      )}

      {due.length > 0 && (
        <Group label="No time yet" count={String(due.length)}>
          <ul>
            {due.map((item) => {
              const isTask = item.targetType === 'Task'
              const overdue = item.note === 'overdue'
              return (
                <Row
                  key={`${item.kind}-${item.id}`}
                  // Only a task can be ticked from here. An assignment or an
                  // exam is finished by what happens to it, which lives on
                  // the node, so it opens instead.
                  onCheck={isTask && item.targetId ? () => onMark({ id: item.targetId!, type: 'Task', name: item.label }, true) : undefined}
                  onOpen={item.targetId ? () => onOpen(item.targetId!) : undefined}
                  label={item.label}
                  busy={busy}
                  meta={
                    <>
                      {overdue ? (
                        <span className="flex items-center gap-0.5 text-destructive/75">
                          <AlertTriangle className="w-2.5 h-2.5" /> overdue
                        </span>
                      ) : isTask ? null : item.note}
                      {/* Moving it on is one tap, rather than a date to edit. */}
                      {isTask && item.targetId && onTomorrow && (
                        <button
                          onClick={() => onTomorrow({ id: item.targetId!, name: item.label })}
                          disabled={busy}
                          className="ml-2 px-1.5 py-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                        >
                          tomorrow →
                        </button>
                      )}
                    </>
                  }
                />
              )
            })}
          </ul>
        </Group>
      )}

      {done.length > 0 && (
        <Group label="Done" count={String(done.length)}>
          <div className="flex flex-wrap gap-1.5">
            {done.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpen(d.id)}
                title={`Done at ${d.at}`}
                className="flex items-center gap-1.5 text-[12.5px] pl-1.5 pr-2.5 py-1 rounded-full bg-emerald-500/10 text-muted-foreground/75 hover:text-foreground transition-colors"
              >
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
                {d.name}
              </button>
            ))}
          </div>
        </Group>
      )}

      {tomorrowHasAnything && (
        <Group label="Tomorrow" count={dayLabel(tomorrow!.date) === 'tomorrow' ? '' : dayLabel(tomorrow!.date)}>
          <ul>
            {tomorrow!.onTheClock.map((t, i) => (
              <li key={`c-${i}`} className="flex items-baseline gap-3 py-1">
                <span className="tabular-nums text-[12.5px] text-foreground/55 w-12 shrink-0">{t.start}</span>
                <span className="text-[13px] text-foreground/75 truncate">{t.what}</span>
              </li>
            ))}
            {dueTomorrow.map((t) => (
              <li key={`d-${t.id}`} className="flex items-baseline gap-3 py-1">
                <span className="text-[12px] text-muted-foreground/65 w-12 shrink-0">due</span>
                <button onClick={() => onOpen(t.id)} className="text-[13px] text-foreground/75 truncate text-left hover:text-foreground">
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {laterThisWeek.length > 0 && (
        <Group label="This week" count={String(laterThisWeek.length)}>
          <ul>
            {laterThisWeek.map((t) => (
              <Row
                key={t.id}
                onCheck={() => onMark({ id: t.id, type: 'Task', name: t.name }, true)}
                onOpen={() => onOpen(t.id)}
                label={t.name}
                busy={busy}
                meta={
                  <>
                    {t.priority === 'high' && <span className="text-amber-600 dark:text-amber-400">high ·&nbsp;</span>}
                    {dayLabel(t.dueDate)}
                  </>
                }
              />
            ))}
          </ul>
        </Group>
      )}
    </div>
  )
}

/** "tomorrow", then weekday names — nothing here is more than a week out. */
function dayLabel(date: string): string {
  if (date === addDays(todayStr(), 1)) return 'tomorrow'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}

/** A label on the left on a wide screen, above on a phone. */
function Group({ label, count, children }: { label: string; count: string; children: React.ReactNode }) {
  return (
    <div className="sm:grid sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/65 mb-2 sm:mb-0 sm:pt-1.5">
        {label} <span className="font-normal text-muted-foreground/50 tabular-nums">{count}</span>
      </p>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Row({ onCheck, onOpen, label, meta, busy }: {
  onCheck?: () => void
  onOpen?: () => void
  label: string
  meta: React.ReactNode
  busy: boolean
}) {
  return (
    <li className="flex items-center gap-2.5 -mx-2 px-2 py-1 rounded-lg hover:bg-muted/25 transition-colors">
      {onCheck ? (
        <button onClick={onCheck} disabled={busy} aria-label={`Complete ${label}`} className="shrink-0 disabled:opacity-40">
          <StatusCheckbox status="todo" />
        </button>
      ) : (
        // Keeps the names in one column whether or not a row can be ticked.
        <span className="w-[18px] shrink-0" />
      )}
      <button
        onClick={onOpen}
        disabled={!onOpen}
        className="flex-1 min-w-0 text-left text-[13px] truncate text-foreground/80 hover:text-foreground disabled:hover:text-inherit"
      >
        {label}
      </button>
      {meta && <span className="flex items-center text-[11.5px] text-muted-foreground/70 shrink-0">{meta}</span>}
    </li>
  )
}
