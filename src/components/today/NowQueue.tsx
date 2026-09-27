'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin, AlertTriangle, Check, Clock3, RefreshCw, ChevronRight } from 'lucide-react'
import { StatusCheckbox, CompletionCheckbox } from '@/components/ui/completion-checkbox'
import { useUndo } from '@/components/undo/UndoProvider'
import { notifyDataChanged, useDataChanged } from '@/lib/dataSignal'
import { addDays } from '@/lib/date'

import type { NowItem, TodayHabit, UpcomingTask } from '@/lib/now'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { DayColumn, type DoneItem, type TomorrowPlan } from './DayColumn'

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

/** The browser's zone, so every plan is for the user's today — see src/lib/clock.ts. */
function zone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined }
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
 * Drawn as a single timeline rather than a highlighted card above a list:
 * the day is a sequence, and a boxed-off "now" with its own border made the
 * next thing look unrelated to it. Everything hangs off one rail, in time
 * order, and the current item is emphasised by weight and a filled marker
 * instead of by being fenced off.
 *
 * Which item is current is decided here rather than on the server: once
 * deployed the server is in UTC and has no idea what time it is where the
 * user is.
 *
 * The rail holds only what has a time. Habits and tasks without one used to
 * trail after the last timed thing, where "Up next" could point at a habit
 * meant for any moment of the day; they sit in a column beside it instead
 * (./DayColumn.tsx), as checklists, with the week's tasks under them.
 */
interface NowPayload {
  items: NowItem[]; habits?: TodayHabit[]; upcoming?: UpcomingTask[]; capacity: Capacity
  done?: DoneItem[]; tomorrow?: TomorrowPlan
}

/*
 * The last day read, kept for the life of the page. Switching to another tab
 * unmounts Today, and coming back used to start from nothing: the assistant
 * box appeared at once and the plan a beat later, every time. Now the plan
 * is drawn from this straight away and refreshed quietly behind it.
 */
let lastNow: NowPayload | null = null
/** Whether Today can draw its plan without waiting for the network. */
export const nowIsCached = () => lastNow !== null

export function NowQueue({ onChanged, onReady }: {
  onChanged?: () => void
  /** Called once the plan can be drawn — so Today can show everything at once. */
  onReady?: () => void
}) {
  const [items, setItems] = useState<NowItem[]>(() => lastNow?.items ?? [])
  const [habits, setHabits] = useState<TodayHabit[]>(() => lastNow?.habits ?? [])
  const [upcoming, setUpcoming] = useState<UpcomingTask[]>(() => lastNow?.upcoming ?? [])
  const [doneToday, setDoneToday] = useState<DoneItem[]>(() => lastNow?.done ?? [])
  const [tomorrowPlan, setTomorrowPlan] = useState<TomorrowPlan | null>(() => lastNow?.tomorrow ?? null)
  const [capacity, setCapacity] = useState<Capacity | null>(() => lastNow?.capacity ?? null)
  const [loading, setLoading] = useState(() => lastNow === null)
  const [busy, setBusy] = useState<number | null>(null)
  /** Opened when a dated module item is tapped — an exam, an assignment. */
  const [detailId, setDetailId] = useState<number | null>(null)
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  const { record } = useUndo()

  const load = useCallback(() => {
    // The zone goes with the request: prayer times are local solar times and
    // the server, once deployed, is in UTC with no idea where the reader is.
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' } })()
    fetch(`/api/now${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NowPayload | null) => {
        if (!d) { setLoading(false); return }
        lastNow = d
        setItems(d.items ?? [])
        setHabits(d.habits ?? [])
        setUpcoming(d.upcoming ?? [])
        setDoneToday(d.done ?? [])
        setTomorrowPlan(d.tomorrow ?? null)
        setCapacity(d.capacity ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!loading) onReady?.() }, [loading, onReady])
  // Anything that changes the day elsewhere — a capture, the chat, a tick in
  // another panel — redraws it here.
  useDataChanged(load)

  /** One line of feedback after an action: where something went, or that it could not. */
  const [note, setNote] = useState<string | null>(null)
  const [replanning, setReplanning] = useState(false)
  /** "Earlier today", folded by default: the page is for what comes next. */
  const [showEarlier, setShowEarlier] = useState(false)

  /** Lays the rest of today out again around whatever has changed. */
  async function replan() {
    if (replanning) return
    setReplanning(true)
    setNote(null)
    const res = await fetch('/api/schedule/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tz: zone() }),
    }).catch(() => null)
    const data = (await res?.json().catch(() => null)) as { unplaced?: { name: string }[] } | null
    setReplanning(false)
    if (!res?.ok || !data) { setNote('Could not replan — try again.'); return }
    const missed = data.unplaced ?? []
    setNote(missed.length ? `Replanned. No room today for ${missed.map((m) => m.name).join(', ')}.` : 'Replanned the rest of today.')
    load()
    onChanged?.()
    notifyDataChanged()
  }

  /** "Not now": push it further on today and let the rest move up. */
  async function later(item: NowItem) {
    if (busy !== null || !item.targetId) return
    setBusy(item.id)
    setNote(null)
    const res = await fetch('/api/schedule/later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: item.targetId, blockId: item.kind === 'block' ? item.id : undefined, tz: zone() }),
    }).catch(() => null)
    const data = (await res?.json().catch(() => null)) as { movedTo?: { start: string } | null } | null
    setBusy(null)
    if (!res?.ok || !data) { setNote('Could not move that — try again.'); return }
    setNote(data.movedTo
      ? `${item.label} moved to ${data.movedTo.start}.`
      : `No room for ${item.label} later today — it's under Due today, where it can go to tomorrow.`)
    load()
    onChanged?.()
    notifyDataChanged()
  }

  /** Off today and onto tomorrow, with undo back to the date it had. */
  async function tomorrow(target: { id: number; name: string }) {
    if (busy !== null) return
    setBusy(target.id)
    const today = new Date().toLocaleDateString('en-CA')
    const current = (await fetch(`/api/nodes/${target.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as
      | { node?: { properties?: { dueDate?: unknown } } }
      | null
    const previous = typeof current?.node?.properties?.dueDate === 'string' ? current.node.properties.dueDate : today
    const patch = (dueDate: string) => fetch(`/api/nodes/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate }),
    })
    await patch(addDays(today, 1)).catch(() => {})
    record(`Moved "${target.name}" to tomorrow`, async () => {
      await patch(previous)
      load()
      notifyDataChanged()
    })
    setBusy(null)
    load()
    onChanged?.()
    notifyDataChanged()
  }

  // The highlighted item, and the progress through it, should follow the
  // clock without a reload.
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMinutes(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  async function complete(item: NowItem) {
    if (busy !== null) return

    /*
     * A prayer is not a node, so there is nothing to mark done on it. It goes
     * on the day's existing HabitLog instead, and the habit it belongs to
     * completes once all five are in — see src/app/api/prayers/route.ts.
     */
    if (item.kind === 'prayer' && item.prayerKey) {
      setBusy(item.id)
      await fetch('/api/prayers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prayer: item.prayerKey, done: true }),
      }).catch(() => {})
      record(`Logged ${item.label}`, async () => {
        await fetch('/api/prayers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prayer: item.prayerKey, done: false }),
        })
        load()
        onChanged?.()
        notifyDataChanged()
      })
      setBusy(null)
      load()
      onChanged?.()
      notifyDataChanged()
      return
    }

    if (!item.targetId || (item.targetType !== 'Habit' && item.targetType !== 'Task')) return
    await mark({ id: item.targetId, type: item.targetType, name: item.label }, true)
  }

  /**
   * Ticks a habit or task on or off — from the rail, inside a batch, or in
   * the column beside it — with the opposite recorded for undo.
   */
  async function mark(target: { id: number; type: string; name: string }, done: boolean) {
    if (busy !== null) return
    setBusy(target.id)
    const endpoint = target.type === 'Habit' ? `/api/habits/${target.id}` : `/api/tasks/${target.id}`
    const body = (on: boolean) => (target.type === 'Habit' ? { completed: on } : { status: on ? 'done' : 'todo' })
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(done)),
    }).catch(() => {})
    record(`${done ? 'Completed' : 'Unticked'} "${target.name}"`, async () => {
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body(!done)),
      })
      load()
      onChanged?.()
      notifyDataChanged()
    })
    setBusy(null)
    load()
    onChanged?.()
    notifyDataChanged()
  }

  if (loading) return null

  const timed = items.filter((i) => i.startTime)
  // Untimed habits come from `habits`, which keeps the finished ones; the
  // queue's own copies would list the open ones twice.
  const untimed = items.filter((i) => !i.startTime && i.kind !== 'habit')

  // "Now" is whatever is happening at this minute; failing that, the next
  // thing with a time. A finished session stays on the timeline but is never
  // what to do now.
  const currentIndex = (() => {
    const during = timed.findIndex(
      (i) => !i.completed && i.startTime && i.endTime && toMinutes(i.startTime) <= nowMinutes && nowMinutes < toMinutes(i.endTime),
    )
    if (during !== -1) return during
    const next = timed.findIndex((i) => !i.completed && i.startTime && toMinutes(i.startTime) >= nowMinutes)
    if (next !== -1) return next
    const anyOpen = timed.findIndex((i) => !i.completed)
    return anyOpen !== -1 ? anyOpen : 0
  })()

  const current = timed[currentIndex] as NowItem | undefined
  const happeningNow = !!current && !current.completed &&
    !!current.startTime && !!current.endTime &&
    toMinutes(current.startTime) <= nowMinutes && nowMinutes < toMinutes(current.endTime)

  // How far through the current block we are, so "now" is a position and not
  // just a label. Only meaningful for something actually under way.
  const elapsed = happeningNow && current
    ? Math.min(100, Math.max(0, ((nowMinutes - toMinutes(current.startTime!)) /
        Math.max(1, toMinutes(current.endTime!) - toMinutes(current.startTime!))) * 100))
    : null

  const minutesLeft = happeningNow && current ? toMinutes(current.endTime!) - nowMinutes : null
  const minutesUntil = !happeningNow && current?.startTime ? toMinutes(current.startTime) - nowMinutes : null

  // Only the part of the working day that is still ahead counts as available.
  const remaining = capacity
    ? Math.max(0, toMinutes(capacity.dayEnd) - Math.max(nowMinutes, toMinutes(capacity.dayStart)))
    : 0
  const overcommitted = capacity ? capacity.committedMinutes > remaining : false

  const actionable = (item: NowItem) =>
    item.kind === 'prayer' ||
    // A batch is ticked off item by item, below; there is no one thing the
    // block as a whole could mean.
    (!item.children?.length && (item.targetType === 'Habit' || item.targetType === 'Task'))

  // Everything on the clock is behind us: the rail keeps them, struck
  // through, but there is no "next" to point at.
  const allPast = !!current && !happeningNow && !!current.startTime && toMinutes(current.startTime) < nowMinutes

  // The day in three parts: what is over (folded away), the one thing that
  // is now or next (opened up), and the rest of today in order.
  const nowItem = allPast ? undefined : current
  const pastItems = allPast ? timed : timed.slice(0, currentIndex)
  const nextItems = allPast ? [] : timed.slice(currentIndex + 1)
  const leftOnClock = nextItems.length + (nowItem ? 1 : 0)

  /** A tick for any row: prayers and single tasks or habits, not batches or events. */
  const tick = (item: NowItem, always = false) => actionable(item) && (
    <button
      onClick={() => complete(item)}
      disabled={busy !== null}
      aria-label={`Done: ${item.label}`}
      className={`shrink-0 disabled:opacity-40 transition-opacity ${
        always ? '' : 'opacity-40 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
      }`}
    >
      {item.targetType === 'Task' ? <StatusCheckbox status="todo" /> : <CompletionCheckbox checked={false} />}
    </button>
  )

  /** The title, opening the item when there is one behind it. */
  const title = (item: NowItem, className: string) =>
    item.targetId !== null && item.kind !== 'prayer' ? (
      <button onClick={() => setDetailId(item.targetId)} className={`block text-left truncate hover:text-foreground ${className}`}>
        {item.label}
      </button>
    ) : (
      <p className={`truncate ${className}`}>{item.label}</p>
    )

  /** What is being worked on inside a batched block. */
  const batch = (item: NowItem) => item.children && item.children.length > 0 && (
    <ul className="mt-2 space-y-1">
      {item.children.map((child) => (
        <li key={child.id} className="flex items-center gap-2">
          <button
            onClick={() => mark(child, true)}
            disabled={busy !== null || child.done}
            aria-label={`Complete ${child.name}`}
            className="shrink-0 disabled:opacity-100"
          >
            {child.type === 'Habit'
              ? <CompletionCheckbox checked={child.done} />
              : <StatusCheckbox status={child.done ? 'done' : 'todo'} />}
          </button>
          <button
            onClick={() => setDetailId(child.id)}
            className={`text-[13px] truncate text-left hover:text-foreground ${child.done ? 'line-through text-muted-foreground/50' : 'text-foreground/75'}`}
          >
            {child.name}
          </button>
        </li>
      ))}
    </ul>
  )

  /** Where, or how long — the one fact worth a glance on a row. */
  const detail = (item: NowItem) =>
    item.note === 'overdue' ? (
      <span className="flex items-center gap-1 text-destructive/80"><AlertTriangle className="w-3 h-3" /> overdue</span>
    ) : item.kind === 'event' && item.note ? (
      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.note}</span>
    ) : item.minutes ? (
      <span className="tabular-nums">{formatHours(item.minutes)}</span>
    ) : null

  /** A plain row of the day: time, what, one detail, a tick. */
  const row = (item: NowItem, past = false) => {
    const finished = item.completed === true
    return (
      <li key={`${item.kind}-${item.id}`} className={`group flex items-start gap-4 py-2.5 ${past ? 'opacity-60' : ''}`}>
        <span className="w-12 shrink-0 pt-[2px] text-[13px] tabular-nums text-foreground/55">{item.startTime}</span>
        <div className="flex-1 min-w-0">
          {title(item, `text-[14.5px] ${finished ? 'line-through text-muted-foreground/60' : 'text-foreground/85'}`)}
          {batch(item)}
        </div>
        <span className="shrink-0 pt-[3px] text-[11.5px] text-muted-foreground/70">{detail(item)}</span>
        {!finished && tick(item)}
      </li>
    )
  }

  return (
    <section className="mb-9">
      {/* The day in one line, and the one control that reshapes it. */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className={`text-[12px] ${overcommitted ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground/75'}`}>
          {timed.length === 0
            ? 'Nothing on the clock'
            : leftOnClock === 0
              ? 'Nothing left on the clock today'
              : `${leftOnClock} left on the clock · ${formatHours(remaining)} of your day left`}
          {overcommitted && capacity && ` · ${formatHours(capacity.committedMinutes - remaining)} too much`}
        </p>
        {/* The day slipped, something new came up: lay the rest out again.
            Nothing already past, and nothing agreed to, is moved. */}
        <button
          onClick={replan}
          disabled={replanning}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border border-border/70 text-foreground/75 hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${replanning ? 'animate-spin' : ''}`} />
          {timed.length === 0 && untimed.length > 0 ? 'Plan my day' : 'Replan'}
        </button>
      </div>

      {note && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[12.5px] text-foreground/80">
          <span className="flex-1">{note}</span>
          <button onClick={() => setNote(null)} className="text-[11.5px] text-muted-foreground/70 hover:text-foreground">OK</button>
        </p>
      )}

      {timed.length === 0 && (
        <p className="py-6 text-[14px] text-muted-foreground/70">
          {untimed.length > 0 || habits.some((h) => !h.done)
            ? 'Nothing has a time yet — press Plan my day to put what is below on the clock.'
            : doneToday.length > 0
              ? 'Nothing left today. Say what is next above, or look at tomorrow below.'
              : 'Nothing on today yet. Say what needs to happen in the box above — it goes straight onto the day.'}
        </p>
      )}

      {/* What is over, folded away: the page is for what comes next. Opened,
          it is still the record — and a prayer not ticked can be ticked. */}
      {pastItems.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowEarlier((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showEarlier ? 'rotate-90' : ''}`} />
            Earlier today · {pastItems.length}
          </button>
          {showEarlier && <ul className="mt-1 divide-y divide-border/30">{pastItems.map((item) => row(item, true))}</ul>}
        </div>
      )}

      {/* Now, or next: the one thing on the page that asks for something. */}
      {nowItem && (
        <div className="rounded-2xl border border-border/70 bg-card px-5 py-4 shadow-[0_2px_12px_oklch(0_0_0/0.05)]">
          <div className="flex items-center gap-2 text-[11.5px]">
            <span className="relative flex w-2 h-2">
              {happeningNow && <span className="absolute inset-0 rounded-full bg-primary/50 animate-ping motion-reduce:hidden" />}
              <span className="relative w-2 h-2 rounded-full bg-primary" />
            </span>
            <span className="font-semibold uppercase tracking-wider text-primary">
              {happeningNow ? 'Now' : 'Next'}
            </span>
            <span className="text-muted-foreground/75">
              {minutesLeft !== null ? `${formatHours(minutesLeft)} left`
                : minutesUntil !== null && minutesUntil > 0 ? `in ${formatHours(minutesUntil)}`
                : null}
            </span>
            <span className="ml-auto tabular-nums text-muted-foreground/75">
              {nowItem.startTime}{nowItem.endTime ? `–${nowItem.endTime}` : ''}
            </span>
          </div>

          {title(nowItem, 'mt-1.5 text-[21px] leading-snug font-serif text-foreground')}
          {detail(nowItem) && <div className="mt-1 text-[12px] text-muted-foreground/75">{detail(nowItem)}</div>}
          {batch(nowItem)}

          {elapsed !== null && (
            <div className="h-1 mt-3 rounded-full bg-border/50 overflow-hidden">
              <div className="h-full rounded-full bg-primary/70 transition-all duration-500" style={{ width: `${elapsed}%` }} />
            </div>
          )}

          {/* The two answers to "this, now?" — did it, or not now. A prayer
              can only be done; an event is a fixed time and needs neither. */}
          {actionable(nowItem) && (
            <div className="flex items-center gap-2 mt-3.5">
              <button
                onClick={() => complete(nowItem)}
                disabled={busy !== null}
                className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Done
              </button>
              {nowItem.kind !== 'prayer' && (
                <button
                  onClick={() => later(nowItem)}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-lg border border-border/70 hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                  <Clock3 className="w-4 h-4" /> Later
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* The rest of today, in order. */}
      {nextItems.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/65 mb-1">Then</p>
          <ul className="divide-y divide-border/30">{nextItems.map((item) => row(item))}</ul>
        </div>
      )}

      {/* Habits and anything without a time, under the day. */}
      <DayColumn
        done={doneToday}
        // In the evening, or once nothing on today's clock is still ahead,
        // the next useful thing to see is tomorrow.
        tomorrow={tomorrowPlan && (nowMinutes >= 17 * 60 || !current || allPast) ? tomorrowPlan : null}
        habits={habits}
        due={untimed}
        upcoming={upcoming}
        busy={busy !== null}
        onMark={mark}
        onOpen={setDetailId}
        onTomorrow={tomorrow}
      />

      {detailId !== null && (
        <NodeDetailPanel
          nodeId={detailId}
          onClose={() => setDetailId(null)}
          onMutated={() => notifyDataChanged()}
        />
      )}
    </section>
  )
}
