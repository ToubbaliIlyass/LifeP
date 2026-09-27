'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  DateSelectArg, DatesSetArg, EventApi, EventClickArg, EventContentArg, EventDropArg, EventInput,
  EventSourceFuncArg,
} from '@fullcalendar/core'
import type { DateClickArg, DropArg, EventResizeDoneArg } from '@fullcalendar/interaction'
import { ChevronLeft, ChevronRight, ListTodo, Sparkles, X, Trash2, Check } from 'lucide-react'
import { UnscheduledRail, type RailPick } from './UnscheduledRail'
import { NewEventDialog, type EventDraft } from './NewEventDialog'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { useTypeColors } from '@/components/graph/useTypeColors'
import { typeColorCss } from '@/lib/colors'
import { batchLabel } from '@/lib/sessions'
import { isDueOn, localDateStr, todayStr } from '@/lib/date'
import './calendar.css'

/*
 * The calendar, on FullCalendar.
 *
 * FullCalendar owns the grid and every gesture on it — dragging, resizing,
 * selecting a stretch of time, long-press on touch, dropping in from the
 * unscheduled list. This file only translates between its events and
 * Acture's three kinds of thing on a calendar:
 *
 *   block    a TimeBlock placing a Task or Habit   — movable, resizable
 *   event    an Event node                          — movable if one-off
 *   content  a ContentPiece with a publish time     — read-only here
 *
 * Two rules keep the grid from flickering, and both were learned the hard
 * way (see `claimGesture` and `persistMove`): never refetch what is already
 * correct on screen, and never act on the same gesture twice.
 */

/** A time block and everything being worked on in it. See src/lib/sessions.ts. */
interface ApiBlock {
  id: number
  date: string
  startTime: string
  endTime: string
  label: string | null
  tasks: { id: number; type: string; name: string; done: boolean }[]
  autoScheduled: boolean
  /** 'tentative' is where the plan put it; 'hard' is a time that was agreed. */
  firmness: 'hard' | 'tentative'
  frequency: string
  recurring: boolean
}

const blockTitle = (b: ApiBlock) =>
  b.label ?? (b.tasks.length === 1 ? b.tasks[0].name : b.tasks.length > 1 ? batchLabel(b.tasks) : 'Time block')

/** A batch gets its own colour; a block holding one thing keeps that thing's. */
const blockKind = (b: ApiBlock) =>
  b.label || b.tasks.length > 1 ? 'session' : (b.tasks[0]?.type ?? 'block').toLowerCase()

interface ApiEvent {
  id: number
  kind: 'event' | 'content'
  name: string
  date: string
  time: string | null
  duration: number | null
  location: string | null
  recurring: boolean
}

interface ApiDay {
  date: string
  blocks: ApiBlock[]
  events: ApiEvent[]
}

type BlockProps = { kind: 'block'; block: ApiBlock; date: string }
type NodeProps = { kind: 'event' | 'content'; nodeId: number }

type ViewMode = 'day' | 'week'

/*
 * Day and week, and nothing else. Month has no room for anything with a
 * time, which is everything this calendar holds; a list of the day is what
 * Today already is. Two views are a choice; four were a settings page.
 */
const VIEWS = {
  day: 'timeGridDay',
  threeDay: 'timeGridThreeDay',
  week: 'timeGridWeek',
} as const

// Module scope, so the array identity never changes between renders.
const PLUGINS = [timeGridPlugin, interactionPlugin]

const VIEW_CONFIG = {
  timeGridThreeDay: { type: 'timeGrid', duration: { days: 3 } },
  timeGridDay: { dayHeaderFormat: { weekday: 'long', month: 'short', day: 'numeric' } },
  timeGridWeek: { dayHeaderFormat: { weekday: 'short', day: 'numeric' } },
} as const

const TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false } as const

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)
const at = (date: string, time: string) => new Date(`${date}T${time}:00`)

/** Phones get a three-day view where a desktop gets a week. */
const NARROW_QUERY = '(max-width: 639px)'
function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW_QUERY)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
}

/** Whether a habit is due on a given day — the block picker only offers those. */
function habitDueOn(habit: { frequency: string; daysOfWeek: number[] | null }, date: string): boolean {
  return isDueOn(habit.frequency, habit.daysOfWeek, new Date(date + 'T00:00:00').getDay())
}

function blockEvent(block: ApiBlock, date: string): EventInput {
  const start = at(date, block.startTime)
  let end = at(date, block.endTime)
  if (end <= start) end = addMinutes(start, 15)
  return {
    // Per occurrence: a routine is one block appearing all week, and a shared
    // id would make FullCalendar treat every day's copy as one draggable thing.
    id: `block:${block.id}:${date}`,
    title: blockTitle(block),
    start,
    end,
    // A tentative block is drawn as a proposal — outlined, not filled — so a
    // day of plans never reads like a day of appointments.
    classNames: [`acture-${blockKind(block)}`, ...(block.firmness === 'tentative' ? ['acture-tentative'] : [])],
    // Moving one morning of a daily routine would need "this one or all of
    // them?" — the same question recurring events dodge. Edit it from the
    // block sheet instead.
    editable: !block.recurring,
    extendedProps: { kind: 'block', block, date } satisfies BlockProps,
  }
}

function toEvents(days: ApiDay[]): EventInput[] {
  const out: EventInput[] = []
  for (const day of days) {
    for (const b of day.blocks) out.push(blockEvent(b, day.date))
    for (const e of day.events) {
      const base = {
        // Per occurrence: a recurring event appears on many days, and a shared
        // id would make FullCalendar treat them as one draggable group.
        id: `${e.kind}:${e.id}:${day.date}`,
        title: e.location && e.kind === 'event' ? `${e.name} · ${e.location}` : e.name,
        classNames: [`acture-${e.kind}`],
        // Moving one occurrence of a repeating event would need "this one or
        // all of them?" — edit those from the event itself instead.
        editable: e.kind === 'event' && !e.recurring,
        extendedProps: { kind: e.kind, nodeId: e.id } satisfies NodeProps,
      }
      if (e.time) {
        const start = at(day.date, e.time)
        out.push({ ...base, start, end: addMinutes(start, e.duration ?? 60) })
      } else {
        out.push({ ...base, start: day.date, allDay: true })
      }
    }
  }
  return out
}

const sameIds = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((id) => b.has(id))

interface CalendarViewProps {
  /** From Settings. Only seeds the initial view — the switcher stays in charge after that. */
  initialViewMode?: ViewMode
  /**
   * The user's day, from Settings. The grid shows from an hour before it
   * starts to midnight: opening on 04:00 spent a third of the screen on
   * hours nobody plans anything into.
   */
  workingHours?: { start: string; end: string }
  /** Lets the parent hide the chat panel while a wide view (week, month) needs the room. */
  onViewModeChange?: (mode: ViewMode) => void
}

export function CalendarView({ onViewModeChange, initialViewMode, workingHours }: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const narrow = useNarrow()

  const [title, setTitle] = useState('')
  const [viewType, setViewType] = useState<string>(
    initialViewMode === 'week' ? (narrow ? VIEWS.threeDay : VIEWS.week) : VIEWS.day,
  )
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null)
  const [railDate, setRailDate] = useState(todayStr())
  const [scheduledIds, setScheduledIds] = useState<Set<number>>(new Set())
  const [unscheduledCount, setUnscheduledCount] = useState(0)
  const [railOpen, setRailOpen] = useState(false)

  const [placing, setPlacing] = useState<RailPick | null>(null)
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [blockMenu, setBlockMenu] = useState<{ block: ApiBlock; date: string; start: Date; end: Date } | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  /**
   * Everything that could be batched into a block, loaded when the sheet
   * opens. Habits belong here as much as tasks do: a morning block is a
   * routine of habits, and offering only tasks made the one kind of session
   * people actually build impossible to build.
   */
  const [attachable, setAttachable] = useState<{ id: number; name: string; type: string }[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [replanning, setReplanning] = useState(false)
  /** The block sheet's rarer options — batching and repeating — folded away. */
  const [moreOptions, setMoreOptions] = useState(false)

  /*
   * `placing` is read inside FullCalendar's gesture handlers. Reading the
   * state there would make every handler change identity whenever a rail
   * item is picked, which re-applies the calendar's whole option set; and,
   * worse, `select` and `dateClick` both fire for one tap and would both see
   * the same pre-clear value. The ref is the one that decides, and it is
   * cleared synchronously, so the second handler finds it already spent.
   */
  const placingRef = useRef<RailPick | null>(null)
  const pick = useCallback((item: RailPick | null) => {
    placingRef.current = item
    setPlacing(item)
  }, [])

  const api = () => calendarRef.current?.getApi()
  const refetch = useCallback(() => calendarRef.current?.getApi().refetchEvents(), [])

  const flash = useCallback((text: string) => {
    setNote(text)
    setTimeout(() => setNote((n) => (n === text ? null : n)), 6000)
  }, [])

  /**
   * Which tasks are spoken for, read back off the calendar itself.
   *
   * The rail hides anything already placed, so this has to be right after
   * every change — including detaching, which puts a task back into the
   * rail. Recomputing from the events on screen is always correct, where
   * adding and removing ids by hand at each call site was one missed case
   * away from a task that could never be scheduled again.
   */
  const syncScheduledIds = useCallback(() => {
    const cal = calendarRef.current?.getApi()
    if (!cal) return
    const ids = new Set<number>()
    for (const event of cal.getEvents()) {
      const props = event.extendedProps as BlockProps | NodeProps
      if (props.kind === 'block') for (const t of props.block.tasks) ids.add(t.id)
    }
    setScheduledIds((prev) => (sameIds(prev, ids) ? prev : ids))
  }, [])

  /*
   * FullCalendar fires BOTH `select` and `dateClick` for a single tap on
   * empty time — a plain click is a zero-distance selection. Each handler
   * then did its own work, which on a touch screen meant two identical
   * TimeBlocks written for one tap: the event appeared twice, and deleting
   * the copy is what looked like the calendar "duplicating and removing"
   * things. Whichever handler arrives first claims the gesture.
   *
   * The window only has to outlast one event-loop turn — both fire from the
   * same pointer event — so it is kept short enough that deliberately
   * tapping two times in quick succession still registers as two.
   */
  const gestureAt = useRef(0)
  const claimGesture = useCallback(() => {
    const now = Date.now()
    if (now - gestureAt.current < 250) return false
    gestureAt.current = now
    return true
  }, [])

  // Stable identity matters: FullCalendar refetches whenever this changes.
  const fetchEvents = useCallback(
    (arg: EventSourceFuncArg, success: (events: EventInput[]) => void, failure: (err: Error) => void) => {
      const from = localDateStr(arg.start)
      const to = localDateStr(new Date(arg.end.getTime() - 1))
      fetch(`/api/calendar?from=${from}&to=${to}`)
        .then((r) => r.json())
        .then((d: { days: ApiDay[] }) => {
          const ids = new Set<number>()
          for (const day of d.days) for (const b of day.blocks) for (const t of b.tasks) ids.add(t.id)
          // Handed over first: this is FullCalendar's own fetch, and a React
          // state update made synchronously inside it re-renders the grid
          // mid-fetch. Deferred, and skipped when nothing actually changed,
          // so a plain navigation does not cascade into re-renders.
          success(toEvents(d.days))
          queueMicrotask(() => setScheduledIds((prev) => (sameIds(prev, ids) ? prev : ids)))
        })
        .catch((err) => failure(err instanceof Error ? err : new Error(String(err))))
    },
    [],
  )

  // Only while a block sheet is open: the list costs a request, and it is
  // the only place anything can be batched into a block.
  useEffect(() => {
    if (!blockMenu) return
    const day = blockMenu.date
    Promise.all([
      fetch('/api/tasks').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/habits').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([td, hd]: [
        { tasks?: { id: number; name: string; status: string; archived: boolean }[] } | null,
        { habits?: { id: number; name: string; frequency: string; daysOfWeek: number[] | null; todayCompleted: boolean }[] } | null,
      ]) => {
        const tasks = (td?.tasks ?? [])
          .filter((t) => !t.archived && t.status !== 'done')
          .map((t) => ({ id: t.id, name: t.name, type: 'Task' }))
        // Only the habits that are due on the day this block sits on — a
        // Tuesday block should not offer a Saturday-only habit.
        const habits = (hd?.habits ?? [])
          .filter((h) => habitDueOn(h, day))
          .map((h) => ({ id: h.id, name: h.name, type: 'Habit' }))
        setAttachable([...habits, ...tasks])
      })
      .catch(() => {})
  }, [blockMenu])

  /*
   * FullCalendar measures its columns once and then only on a *window*
   * resize. Everything that actually changes this calendar's width is a
   * container change instead — the unscheduled rail appearing, the chat
   * panel folding away, the panel settling after mount — and none of those
   * are a window resize, so the grid kept the width it was born with and
   * left a band of empty space down the right.
   *
   * It used to get away with it: re-rendering the element re-applied the
   * options, which resized it as a side effect. Holding the grid in a memo
   * (so a toast no longer rebuilds the whole calendar) took that away, so
   * the resize is now asked for directly, which is what it should always
   * have been.
   */
  useEffect(() => {
    const el = gridRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      // Coalesced into a frame: a drag on the chat's resize handle fires
      // this continuously, and updateSize does real layout work.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => calendarRef.current?.getApi().updateSize())
    })
    observer.observe(el)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [])

  // A phone rotated or a window narrowed while in week view: fall back to
  // three days instead of seven squeezed columns, and back again.
  useEffect(() => {
    const cal = calendarRef.current?.getApi()
    if (!cal) return
    const current = cal.view.type
    if (narrow && current === VIEWS.week) cal.changeView(VIEWS.threeDay)
    if (!narrow && current === VIEWS.threeDay) cal.changeView(VIEWS.week)
  }, [narrow])

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setTitle(arg.view.title)
    setViewType(arg.view.type)
    setRange({ start: arg.view.activeStart, end: arg.view.activeEnd })
    // The rail lists what is due on the first day in view.
    setRailDate(localDateStr(arg.view.currentStart))
    onViewModeChange?.(arg.view.type === VIEWS.week ? 'week' : 'day')
  }, [onViewModeChange])

  // ── Writes ───────────────────────────────────────────────

  /**
   * Places a task or habit at a time.
   *
   * The new block is added to the grid directly rather than by refetching
   * the range: a refetch tears down and rebuilds every event on screen, and
   * for the second or two the request is in flight the thing the user just
   * dropped is either missing or drawn twice. One `addEvent` puts it exactly
   * where they let go of it and leaves everything else alone.
   */
  const createBlock = useCallback(async (item: RailPick, start: Date, minutes: number) => {
    const end = addMinutes(start, minutes)
    const date = localDateStr(start)
    // Clamped to the same day; a block cannot run past midnight.
    const endTime = localDateStr(end) === date ? hm(end) : '23:59'

    const res = await fetch('/api/calendar/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, startTime: hm(start), endTime, sourceNodeId: item.sourceId }),
    })
    const data = (await res.json().catch(() => null)) as { block?: { id: number } } | null
    if (!res.ok || !data?.block) {
      flash('Could not put that on the calendar')
      return
    }

    const block: ApiBlock = {
      id: data.block.id,
      date,
      startTime: hm(start),
      endTime,
      label: null,
      tasks: [{ id: item.sourceId, type: item.sourceType, name: item.title, done: false }],
      autoScheduled: false,
      // Put here by hand, on purpose: the planner may not move it.
      firmness: 'hard',
      frequency: 'once',
      recurring: false,
    }
    api()?.addEvent(blockEvent(block, date))
    syncScheduledIds()
  }, [flash, syncScheduledIds])

  /** Drag and resize share this: work out where the event is now and save it. */
  const persistMove = useCallback(async (event: EventApi, revert: () => void) => {
    const props = event.extendedProps as BlockProps | NodeProps
    const start = event.start
    if (!start) return revert()
    const end = event.end ?? addMinutes(start, 60)
    const date = localDateStr(start)
    const endTime = localDateStr(end) === date ? hm(end) : '23:59'

    let res: Response
    if (props.kind === 'block') {
      // A block is a slot of time; the all-day row has no time to give it.
      if (event.allDay) return revert()
      res = await fetch(`/api/calendar/blocks/${props.block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startTime: hm(start), endTime }),
      })
    } else if (props.kind === 'event') {
      const body = event.allDay
        ? { date, __remove: ['time', 'duration'] }
        : { date, time: hm(start), duration: Math.max(5, Math.round((end.getTime() - start.getTime()) / 60_000)) }
      res = await fetch(`/api/nodes/${props.nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      return revert()
    }

    if (!res.ok) {
      revert()
      flash('Could not save that change')
      return
    }

    /*
     * No refetch. FullCalendar has already drawn the event where the user
     * dropped it, and the server just agreed — pulling the range again only
     * rebuilds the same grid, which is what made a dragged event flash
     * back to its old place and then jump forward again.
     *
     * What does need doing is keeping the props that were baked in at fetch
     * time honest, since they are what a later delete reads.
     */
    if (props.kind === 'block') {
      // The server promotes a dragged tentative block to 'hard' (a time the
      // user chose), so the props baked in at fetch time must say so too.
      const moved: ApiBlock = { ...props.block, startTime: hm(start), endTime, firmness: 'hard' }
      event.setExtendedProp('date', date)
      event.setExtendedProp('block', moved)
      event.setProp('classNames', [`acture-${blockKind(moved)}`])
    }
  }, [flash])

  /*
   * A block's contents, changed in place.
   *
   * Each of these re-reads the block from the server rather than patching it
   * locally: what changed is an edge, and the block's title, colour and task
   * list are all derived from the set of them. Reconstructing that on the
   * client would be a second implementation of src/lib/sessions.ts waiting to
   * disagree with the first.
   */
  const reloadBlock = useCallback(async (blockId: number, date: string) => {
    const day = (await fetch(`/api/calendar?date=${date}`)
      .then((r) => r.json())
      .catch(() => null)) as { blocks?: ApiBlock[] } | null
    const fresh = day?.blocks?.find((b) => b.id === blockId)
    if (!fresh) return
    setBlockMenu((m) => (m && m.block.id === blockId ? { ...m, block: fresh } : m))
    const event = api()?.getEventById(`block:${blockId}:${date}`)
    if (event) {
      event.setProp('title', blockTitle(fresh))
      event.setProp('classNames', [`acture-${blockKind(fresh)}`, ...(fresh.firmness === 'tentative' ? ['acture-tentative'] : [])])
      event.setExtendedProp('block', fresh)
    }
    syncScheduledIds()
  }, [syncScheduledIds])

  const patchBlock = useCallback(async (body: Record<string, unknown>) => {
    const menu = blockMenu
    if (!menu) return
    const res = await fetch(`/api/calendar/blocks/${menu.block.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { flash('Could not change that block'); return }
    await reloadBlock(menu.block.id, menu.date)
  }, [blockMenu, flash, reloadBlock])

  const attachTask = useCallback((taskId: number) => patchBlock({ addTask: taskId }), [patchBlock])
  const detachTask = useCallback((taskId: number) => patchBlock({ removeTask: taskId }), [patchBlock])

  /*
   * Typing in the name field should not be a request per keystroke, and the
   * block only needs to know the final answer.
   */
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renameBlock = useCallback((label: string) => {
    setBlockMenu((m) => (m ? { ...m, block: { ...m.block, label } } : m))
    if (renameTimer.current) clearTimeout(renameTimer.current)
    renameTimer.current = setTimeout(() => { void patchBlock({ label }) }, 500)
  }, [patchBlock])

  /**
   * Done, from the calendar: ticks off what the block holds, the same way
   * Today does, and redraws it struck through.
   */
  const completeBlock = useCallback(async (block: ApiBlock, date: string) => {
    for (const t of block.tasks.filter((x) => !x.done)) {
      const res = t.type === 'Habit'
        ? await fetch(`/api/habits/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true, date }) })
        : await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) })
      if (!res.ok) { flash(`Could not mark ${t.name} done`); return }
    }
    setBlockMenu(null)
    await reloadBlock(block.id, date)
    flash(block.tasks.length === 1 ? `${block.tasks[0].name} done` : 'Done')
  }, [flash, reloadBlock])

  const removeBlock = useCallback(async (block: ApiBlock, date: string) => {
    setBlockMenu(null)
    await fetch(`/api/calendar/blocks/${block.id}`, { method: 'DELETE' })
    // Habit slots are auto-filled for today and future due days — without
    // this, a removed one reappears on the next load. An (incomplete) log for
    // that date tells the planner the user already decided on this occurrence.
    if (date >= todayStr()) {
      for (const habit of block.tasks.filter((t) => t.type === 'Habit')) {
        await fetch(`/api/habits/${habit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: false, date }),
        })
      }
    }
    api()?.getEventById(`block:${block.id}:${date}`)?.remove()
    syncScheduledIds()
  }, [syncScheduledIds])

  // ── Gestures ─────────────────────────────────────────────

  const startPlacement = useCallback((date: Date, allDay: boolean) => {
    const item = placingRef.current
    if (!item) return false
    if (allDay) {
      flash('Pick a time, not the all-day row')
      return true
    }
    pick(null)
    void createBlock(item, date, item.minutes)
    return true
  }, [createBlock, flash, pick])

  const onDateClick = useCallback((info: DateClickArg) => {
    if (!claimGesture()) return
    if (startPlacement(info.date, info.allDay)) return
    // A tap on empty time starts an hour-long event there, like Google Calendar.
    setDraft({
      start: info.date,
      end: info.allDay ? info.date : addMinutes(info.date, 60),
      allDay: info.allDay,
    })
  }, [claimGesture, startPlacement])

  const onSelect = useCallback((info: DateSelectArg) => {
    info.view.calendar.unselect()
    if (!claimGesture()) return
    if (startPlacement(info.start, info.allDay)) return
    setDraft({ start: info.start, end: info.end, allDay: info.allDay })
  }, [claimGesture, startPlacement])

  const onDrop = useCallback((info: DropArg) => {
    const sourceId = Number(info.draggedEl.dataset.sourceId)
    if (!sourceId) return
    if (info.allDay) return flash('Drop it on a time, not the all-day row')
    const minutes = Number(info.draggedEl.dataset.minutes) || 30
    void createBlock({
      sourceId,
      title: info.draggedEl.dataset.title ?? 'Time block',
      sourceType: info.draggedEl.dataset.sourceType === 'Habit' ? 'Habit' : 'Task',
      minutes,
    }, info.date, minutes)
  }, [createBlock, flash])

  const onEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault()
    const props = info.event.extendedProps as BlockProps | NodeProps
    if (props.kind === 'block') {
      setMoreOptions(false)
      setBlockMenu({
        block: props.block,
        date: props.date,
        start: info.event.start!,
        end: info.event.end ?? addMinutes(info.event.start!, 30),
      })
    } else {
      setDetailId(props.nodeId)
    }
  }, [])

  /*
   * A session draws its contents, not just a count.
   *
   * "3 tasks" on a bar is no use for deciding whether to start it — the
   * point of batching is seeing what the two hours actually hold. Returning
   * `true` leaves every other event on FullCalendar's own rendering, so only
   * batched blocks are drawn by hand.
   */
  const renderEvent = useCallback((arg: EventContentArg) => {
    const props = arg.event.extendedProps as BlockProps | NodeProps
    if (arg.event.allDay) return true
    if (props.kind !== 'block' || props.block.tasks.length < 2) {
      // Name first and large enough to read, the time after it: a
      // fifteen-minute habit used to be a hairline with 9px text in it.
      const start = arg.event.start ? hm(arg.event.start) : ''
      const end = arg.event.end ? hm(arg.event.end) : ''
      return (
        <div className="acture-ev">
          <span className="acture-ev-title">{arg.event.title}</span>
          <span className="acture-ev-time">{start}{end ? `–${end}` : ''}</span>
        </div>
      )
    }
    return (
      <div className="acture-session-body">
        <div className="acture-session-name">{blockTitle(props.block)}</div>
        <ul className="acture-session-list">
          {props.block.tasks.map((t) => (
            <li key={t.id} className={t.done ? 'is-done' : undefined}>{t.name}</li>
          ))}
        </ul>
      </div>
    )
  }, [])

  const onRailPick = useCallback((item: RailPick) => {
    pick(placingRef.current?.sourceId === item.sourceId ? null : item)
    setRailOpen(false)
  }, [pick])

  async function onEventCreated(id: number, linking: boolean) {
    setDraft(null)
    refetch()
    if (!linking) return
    const d = (await fetch(`/api/calendar/events/${id}/links`, { method: 'POST' })
      .then((r) => r.json())
      .catch(() => null)) as { proposed?: boolean; linked?: number; names?: string[] } | null
    if (!d?.names?.length) return
    if (d.linked) {
      flash(`Linked it to ${d.names.join(', ')}`)
      refetch()
    } else if (d.proposed) {
      flash(`Suggested linking it to ${d.names.join(', ')} — review in Proposals`)
    }
  }

  /**
   * Lay out the days in view again.
   *
   * Only ever touches tentative blocks — habits and tasks the planner placed.
   * Anything agreed to (an appointment, a class, or a planned slot the user
   * dragged somewhere) stays exactly where it is, which is what makes this
   * safe to press whenever the day stops matching the plan.
   */
  async function planDays() {
    if (replanning || !range) return
    setReplanning(true)
    try {
      const today = localDateStr(new Date())
      // Whatever is on screen, capped at a week so a month view does not
      // rewrite six weeks in one click. Days already gone cannot be planned.
      const span = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000))
      const dates = Array.from({ length: Math.min(7, span) }, (_, i) =>
        localDateStr(new Date(range.start.getTime() + i * 86_400_000)),
      ).filter((d) => d >= today)

      if (dates.length === 0) {
        flash('That day has already gone')
        return
      }

      // The browser's zone, so "today" and "now" are the user's, not the server's.
      const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } })()
      let scheduled = 0
      // What had no room, by name, once each — the same task can miss on
      // several days and is still one thing to hear about.
      const missed = new Map<number, string>()
      for (const date of dates) {
        const res = await fetch('/api/schedule/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, tz }),
        })
        const data = (await res.json().catch(() => null)) as
          | { scheduled?: number; unplaced?: { taskId: number; name: string }[] }
          | null
        if (!res.ok || !data || typeof data.scheduled !== 'number') {
          flash('Could not plan that')
          return
        }
        scheduled += data.scheduled
        for (const u of data.unplaced ?? []) missed.set(u.taskId, u.name)
      }

      const planned =
        scheduled === 0
          ? 'Nothing left to plan'
          : dates.length === 1
            ? `${scheduled} planned into the day`
            : `${scheduled} planned across ${dates.length} days`
      const names = [...missed.values()]
      flash(
        names.length === 0
          ? planned
          : `${planned}. No room for ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}.`,
      )
      refetch()
    } catch {
      flash('Could not plan that')
    } finally {
      setReplanning(false)
    }
  }

  // ── Render ───────────────────────────────────────────────

  const scrollTime = useMemo(() => `${pad(Math.max(0, new Date().getHours() - 1))}:00:00`, [])
  // An hour of margin before the day starts, and on to midnight.
  const slotMinTime = useMemo(() => {
    const h = Number((workingHours?.start ?? '07:00').split(':')[0])
    return `${pad(Number.isFinite(h) ? Math.max(0, h - 1) : 6)}:00:00`
  }, [workingHours?.start])
  const typeColors = useTypeColors()
  const typeColorStyle = useMemo(() => typeColorCss('.acture-cal', typeColors), [typeColors])
  const switcher = narrow
    ? [['Day', VIEWS.day], ['3 days', VIEWS.threeDay]]
    : [['Day', VIEWS.day], ['Week', VIEWS.week]]
  const isWeek = viewType === VIEWS.week || viewType === VIEWS.threeDay

  /*
   * Held apart from the rest of the render on purpose.
   *
   * Everything else here re-renders constantly — a toast, the placement
   * banner, opening the block sheet — and FullCalendar's React wrapper
   * re-applies its entire option set on every render it sees, which on a
   * week view is visibly slow and interrupts a drag in progress. Every
   * dependency below is stable, so the grid renders once and then only when
   * something that genuinely concerns it changes.
   */
  const grid = useMemo(() => (
    <FullCalendar
      ref={calendarRef}
      plugins={PLUGINS}
      initialView={viewType}
      headerToolbar={false}
      height="100%"
      events={fetchEvents}
      datesSet={onDatesSet}
      views={VIEW_CONFIG}
      // Grid lines every half hour, but things snap to ten minutes —
      // fine enough for a five-minute habit, without a wall of lines.
      slotDuration="00:30:00"
      snapDuration="00:10:00"
      slotLabelInterval="01:00"
      scrollTime={scrollTime}
      scrollTimeReset={false}
      slotMinTime={slotMinTime}
      slotMaxTime="24:00:00"
      // Tall enough to read a name in, however short the thing is.
      eventMinHeight={26}
      eventShortHeight={40}
      nowIndicator
      allDaySlot
      firstDay={1}
      navLinks
      slotLabelFormat={TIME_FORMAT}
      eventTimeFormat={TIME_FORMAT}
      editable
      eventResizableFromStart={false}
      eventDurationEditable
      selectable
      selectMirror
      // A click is a tap (dateClick); only an actual drag selects a range.
      selectMinDistance={narrow ? 0 : 6}
      droppable
      longPressDelay={350}
      eventLongPressDelay={350}
      selectLongPressDelay={350}
      dateClick={onDateClick}
      select={onSelect}
      drop={onDrop}
      eventClick={onEventClick}
      eventDrop={(info: EventDropArg) => persistMove(info.event, info.revert)}
      eventResize={(info: EventResizeDoneArg) => persistMove(info.event, info.revert)}
      eventContent={renderEvent}
    />
    // `viewType` is deliberately absent: it only seeds `initialView`, and
    // changing views goes through the calendar's own API, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [narrow, scrollTime, slotMinTime, fetchEvents, onDatesSet, onDateClick, onSelect, onDrop, onEventClick, persistMove, renderEvent])

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* What still needs a time — beside the grid at md+, a drawer below md. */}
      <div className="hidden md:flex h-full">
        <UnscheduledRail
          date={railDate}
          scheduledNodeIds={scheduledIds}
          onCountChange={setUnscheduledCount}
          onPick={onRailPick}
          pickedId={placing?.sourceId ?? null}
        />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Toolbar: where you are, the one action, and day or week. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 md:px-5 py-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button
              onClick={() => setRailOpen(true)}
              className="md:hidden relative p-1.5 -ml-1 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground"
              aria-label="Show what still needs a time"
            >
              <ListTodo className="w-4 h-4" />
              {unscheduledCount > 0 && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
            <button onClick={() => api()?.prev()} aria-label="Previous" className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => api()?.next()} aria-label="Next" className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => { api()?.today(); api()?.scrollToTime(scrollTime) }}
              className="text-[12.5px] font-medium px-3 py-1 rounded-full border border-border/70 hover:bg-muted/40"
            >
              Today
            </button>
            <p className="text-[17px] font-serif text-foreground truncate ml-2">{title}</p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-full p-0.5">
              {switcher.map(([label, type]) => (
                <button
                  key={type}
                  onClick={() => api()?.changeView(type)}
                  className={`text-[12px] font-medium px-3 py-1 rounded-full transition-colors ${
                    viewType === type ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* The one thing to do here: lay what is due into the free time
                in view. Nothing agreed to is ever moved by it. */}
            <button
              onClick={planDays}
              disabled={replanning}
              title="Lay habits and due tasks into the free time in view — nothing you agreed to moves"
              className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {replanning ? 'Planning…' : isWeek ? 'Plan these days' : 'Plan this day'}
            </button>
          </div>
        </div>

        {placing && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20 text-[12px] shrink-0">
            <span className="flex-1 min-w-0 truncate">
              Tap a time to place <strong>{placing.title}</strong> ({placing.minutes} min)
            </span>
            <button onClick={() => pick(null)} className="text-[11px] font-mono px-2 py-0.5 rounded-md border border-border/60 bg-background">
              cancel
            </button>
          </div>
        )}
        {note && (
          <div className="flex items-center gap-2 px-5 py-2 text-[12.5px] text-foreground/80 bg-muted/40 border-b border-border/40 shrink-0" role="status">
            <span className="flex-1 min-w-0">{note}</span>
            <button onClick={() => setNote(null)} className="text-[11.5px] text-muted-foreground hover:text-foreground">OK</button>
          </div>
        )}

        {/* The user's per-type hues, as custom properties the rules in
            calendar.css read. A stylesheet rather than a style attribute
            because it carries light and dark at once, so toggling the mode
            repaints through the cascade instead of waiting on a render. */}
        <style>{typeColorStyle}</style>
        <div ref={gridRef} className="acture-cal flex-1 min-h-0 px-1 md:px-2 pb-1">{grid}</div>
      </div>

      {/* Mobile rail drawer */}
      {railOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRailOpen(false)} />
          <div className="relative h-full">
            <UnscheduledRail
              date={railDate}
              scheduledNodeIds={scheduledIds}
              onClose={() => setRailOpen(false)}
              onPick={onRailPick}
              pickedId={placing?.sourceId ?? null}
            />
          </div>
        </div>
      )}

      {draft && <NewEventDialog draft={draft} onClose={() => setDraft(null)} onCreated={onEventCreated} />}

      {blockMenu && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setBlockMenu(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-card border border-border/60 rounded-t-2xl sm:rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="flex items-start gap-2 mb-3">
              <div className="flex-1 min-w-0">
                {/* The session's own name, editable in place — "Study" or
                    "CLE shift" is what the two hours are, and the tasks are
                    what happens inside them. */}
                <input
                  value={blockMenu.block.label ?? ''}
                  onChange={(e) => renameBlock(e.target.value)}
                  placeholder={blockMenu.block.tasks.length > 1 ? 'Name this session…' : blockTitle(blockMenu.block)}
                  aria-label="Session name"
                  className="w-full bg-transparent text-[16px] focus:outline-none placeholder:text-muted-foreground/50 border-b border-transparent focus:border-border/60"
                />
                <p className="text-[12px] text-muted-foreground mt-0.5 tabular-nums">
                  {hm(blockMenu.start)}–{hm(blockMenu.end)}
                  {blockMenu.block.tasks.length > 0 && ` · ${blockMenu.block.tasks.length === 1 ? blockMenu.block.tasks[0].type.toLowerCase() : batchLabel(blockMenu.block.tasks)}`}
                  {blockMenu.block.recurring && ' · repeats'}
                  {blockMenu.block.firmness === 'tentative' && ' · planned, not fixed'}
                </p>
              </div>
              <button onClick={() => setBlockMenu(null)} aria-label="Close" className="p-1 rounded-md text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* What is being worked on in this block — listed only when there
                is more than one thing; a single one is the title above. */}
            {blockMenu.block.tasks.length === 1 && (
              <button
                onClick={() => { setDetailId(blockMenu.block.tasks[0].id); setBlockMenu(null) }}
                className="mb-3 text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Open {blockMenu.block.tasks[0].type.toLowerCase()} details
              </button>
            )}
            {blockMenu.block.tasks.length > 1 && (
              <div className="space-y-1 mb-3 -mx-1">
                {blockMenu.block.tasks.map((t) => (
                  <div key={t.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30">
                    <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider w-12 shrink-0">{t.type}</span>
                    <button
                      onClick={() => { setDetailId(t.id); setBlockMenu(null) }}
                      className={`flex-1 min-w-0 text-left text-[13px] truncate hover:text-foreground ${t.done ? 'line-through text-muted-foreground/50' : 'text-foreground/85'}`}
                    >
                      {t.name}
                    </button>
                    <button
                      onClick={() => detachTask(t.id)}
                      title="Take out of this block"
                      aria-label={`Take ${t.name} out of this block`}
                      className="shrink-0 p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* What people do with a block, in order of how often: it is
                done, the time is right, it should not be there. */}
            {blockMenu.block.tasks.length > 0 && blockMenu.block.tasks.some((t) => !t.done) && (
              <button
                onClick={() => completeBlock(blockMenu.block, blockMenu.date)}
                className="w-full flex items-center justify-center gap-1.5 text-[13px] font-semibold px-3 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 mb-2"
              >
                <Check className="w-4 h-4" /> Done
              </button>
            )}

            {/* Accepting a planned slot, without having to drag it somewhere
                to say so. Until it is accepted, planning again may move it. */}
            <div className="flex gap-2">
              <button
                onClick={() => patchBlock({ firmness: blockMenu.block.firmness === 'tentative' ? 'hard' : 'tentative' })}
                className="flex-1 text-[12.5px] font-medium px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/40"
              >
                {blockMenu.block.firmness === 'tentative' ? 'Keep this time' : 'Let the planner move it'}
              </button>
              <button
                onClick={() => removeBlock(blockMenu.block, blockMenu.date)}
                className="flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-medium px-3 py-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {blockMenu.block.recurring ? 'Delete routine' : 'Remove'}
              </button>
            </div>

            {/* The rarer things — putting more into this block, making it a
                routine — out of the way until asked for. */}
            <button
              onClick={() => setMoreOptions((v) => !v)}
              className="flex items-center gap-1 mt-3 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${moreOptions ? 'rotate-90' : ''}`} />
              More options
            </button>
            {moreOptions && (
              <div className="mt-2">
            {/* Batching: another task into the same stretch of time, rather
                  than another block over the top of it. */}
              <select
                value=""
                onChange={(e) => { if (e.target.value) attachTask(Number(e.target.value)) }}
                aria-label="Add a task or habit to this block"
                className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[12px] mb-3 focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">+ Add to this block…</option>
                {attachable
                  .filter((t) => !blockMenu.block.tasks.some((x) => x.id === t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.type === 'Habit' ? `${t.name} · habit` : t.name}
                    </option>
                  ))}
              </select>

              {/* A routine: the same block, with the same things in it, every
                  day it runs. One definition instead of rebuilding it each
                  morning. */}
              <label className="flex items-center gap-2 mb-3 text-[11px] font-mono text-muted-foreground/70">
                Repeats
                <select
                  value={blockMenu.block.frequency}
                  onChange={(e) => patchBlock({
                    frequency: e.target.value,
                    // "Every Wednesday" has to record which day that is.
                    ...(e.target.value === 'weekly'
                      ? { daysOfWeek: [new Date(blockMenu.date + 'T00:00:00').getDay()] }
                      : {}),
                  })}
                  className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="once">Just this day</option>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Every {new Date(blockMenu.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })}</option>
                </select>
              </label>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground/65 mt-3">Drag it to move it · drag its bottom edge to change how long.</p>
          </div>
        </div>
      )}

      {detailId !== null && (
        <NodeDetailPanel
          nodeId={detailId}
          onClose={() => setDetailId(null)}
          onMutated={() => { setDetailId(null); refetch() }}
        />
      )}
    </div>
  )
}
