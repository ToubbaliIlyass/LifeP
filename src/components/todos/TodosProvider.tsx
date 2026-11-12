'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { EventStatus } from '@/lib/event-status'
import type { DayEvent, Todo, TodoList, TodosPayload } from '@/lib/todos'
import { useUndo } from '@/components/undo/UndoProvider'
import { toastDismiss, toastNote, toastReminder, toastUndo, type Tone } from '@/lib/toast'
import { useDataChanged } from '@/lib/dataSignal'
import { useLiveSync } from '@/lib/useLiveSync'
import { todayStr } from '@/lib/date'
import { clockZone, wallNow } from '@/lib/wallclock'
import { dayFacts } from '@/lib/tuck/mood'
import { relDate, skipPreview } from '@/lib/todo-views'
import { safeGet, safeSet } from '@/lib/storage'
import { parseEntry } from '@/lib/quick-entry'
import { SAVE_FAILED, SAY, TICKED } from '@/lib/tuck/events'
import { dueReminders, remindersIn, SNOOZES, snoozeUntil, type Reminder } from '@/lib/reminders'
import { momentNow, pushIsOn, systemNotification } from '@/lib/push'

/** The to-do being typed, before it has a row of its own. */
export const DRAFT_ID = -999

/** How long typing rests before it is written. */
const WRITE_DELAY_MS = 450

type ListKind = 'project' | 'area'

interface TodosContextValue {
  ready: boolean
  date: string
  todos: Todo[]
  lists: TodoList[]
  events: DayEvent[]
  /** Changes a to-do: on screen at once, written a moment later. */
  patch: (id: number, changes: Partial<Todo>) => void
  toggle: (todo: Todo) => void
  /** Skips this time round of a repeating to-do; the series carries on. Undoable. */
  skip: (todo: Todo) => void
  /** Settles one day of an event: attended, cancelled or not gone to. Leaves the day's list; undoable. */
  resolveEvent: (event: DayEvent, status: EventStatus | null) => void
  remove: (todo: Todo) => void
  /** Opens a blank to-do with these fields already set. */
  startDraft: (defaults: Partial<Todo>) => void
  /** Saves the draft if it was given a title, and drops it if not. */
  endDraft: () => void
  patchList: (id: number, changes: Partial<TodoList>) => void
  createList: (kind: ListKind, areaId: number | null) => Promise<number | null>
  removeList: (list: TodoList) => void
  /** The to-do being dragged, so a row or the sidebar can take it — the first, when several are. */
  dragId: () => number | null
  /** Everything being dragged: a multi-selection moves together. */
  dragIds: () => number[]
  setDragId: (id: number | null) => void
  setDragIds: (ids: number[]) => void
  /** The + itself is being dragged (Magic Plus): wherever it lands, a new to-do starts there. */
  plusDragging: () => boolean
  setPlusDragging: (on: boolean) => void
  /** Asks the next list that opens to open this to-do — how Quick Find takes you to one. */
  requestOpen: (id: number) => void
  takeOpenRequest: () => number | null
  reload: () => void
  /**
   * What is happening behind the screen, for Tuck (see TuckStatus): writes
   * still on their way, and whether the lists could not be read because the
   * server is not answering. (A write that failed, or a to-do ticked, is
   * announced as a window event: see src/lib/tuck/events.ts.)
   */
  saving: boolean
  down: boolean
  /** How many finished things are in the Logbook's archive (loaded on demand, not in `todos`). */
  archived: number
}

const TodosContext = createContext<TodosContextValue | null>(null)

export function useTodos(): TodosContextValue {
  const ctx = useContext(TodosContext)
  if (!ctx) throw new Error('useTodos must be used inside TodosProvider')
  return ctx
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const blank = (defaults: Partial<Todo>): Todo => ({
  id: DRAFT_ID, type: 'Task', title: '', notes: '', when: null, evening: false, someday: false,
  deadline: null, time: null, timePlanned: false, minutes: null, tags: [], checklist: [], listId: null, headingId: null, done: false, doneAt: null,
  order: 0, repeats: null, repeatDays: null, reminder: null, priority: null, ...defaults,
})

/**
 * The lists, held once for the sidebar and whichever list is open.
 *
 * Every change shows immediately and is written behind it. The one rule that
 * makes that safe: nothing is re-read from the server while a write is still
 * on its way, or the answer would put back what the user just changed. A
 * reload asked for in the meantime — the assistant added something, a day
 * was planned — waits until the writes have landed.
 */
export function TodosProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<TodosPayload | null>(null)
  const [draft, setDraft] = useState<Todo | null>(null)
  const { record } = useUndo()
  const [saving, setSaving] = useState(false)
  const [down, setDown] = useState(false)
  /** The island after a skip or a tick: what happened, and the way back. */
  const setNote = useCallback((n: { title: string; detail: string; undo: (() => void) | null; tone?: Tone } | null) => {
    if (!n) { toastDismiss('acture-todo'); return }
    if (n.undo) toastUndo(n.title, n.detail, n.undo, 'acture-todo', n.tone)
    else toastNote(n.title, n.detail, 'acture-todo', n.tone ?? 'info')
  }, [])

  const queue = useRef(new Map<number, { changes: Record<string, unknown>; timer: ReturnType<typeof setTimeout> }>())
  const inflight = useRef(0)
  const reloadWanted = useRef(false)
  const draggingRef = useRef<number[]>([])
  const dragId = useCallback(() => draggingRef.current[0] ?? null, [])
  const dragIds = useCallback(() => draggingRef.current, [])
  const setDragId = useCallback((id: number | null) => { draggingRef.current = id === null ? [] : [id] }, [])
  const setDragIds = useCallback((ids: number[]) => { draggingRef.current = ids }, [])
  const plusRef = useRef(false)
  const plusDragging = useCallback(() => plusRef.current, [])
  const setPlusDragging = useCallback((on: boolean) => { plusRef.current = on }, [])
  const openRef = useRef<number | null>(null)
  const requestOpen = useCallback((id: number) => { openRef.current = id }, [])
  const takeOpenRequest = useCallback(() => { const id = openRef.current; openRef.current = null; return id }, [])

  /*
   * Reminders, while Acture is open: whatever src/lib/reminders.ts says is
   * due slides in as a card in the corner — Done, Snooze, or put away — and,
   * where push is not set up on this device, as a system notification too
   * (with push on, the server sends that one; see src/lib/push.ts). Each is
   * remembered on this device once shown, so a reload does not repeat it.
   * One missed while the app was closed still shows when it next opens, for
   * the rest of that day.
   */
  /** Rings one reminder in the island; set once the actions it offers exist, below. */
  const remindRef = useRef<(r: Reminder) => void>(() => {})
  const todosRef = useRef<Todo[]>([])
  useEffect(() => { todosRef.current = data?.todos ?? [] }, [data])
  const eventsRef = useRef<DayEvent[]>([])
  useEffect(() => { eventsRef.current = data?.events ?? [] }, [data])
  const draftRef = useRef<Todo | null>(null)
  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => {
    const check = () => {
      const now = momentNow()
      const all = remindersIn({ todos: todosRef.current, events: eventsRef.current })
      const shown = (r: Reminder) => !!safeGet('local', `acture-reminded:${r.key}`)
      // Anything from earlier today counts: a missed reminder still says so.
      const due = dueReminders(all, now, new Set(all.filter(shown).map((r) => r.key)), 24 * 60)
        .filter((r) => r.at.slice(0, 10) === now.slice(0, 10))
      for (const r of due) {
        safeSet('local', `acture-reminded:${r.key}`, '1')
        remindRef.current(r)
        if (!pushIsOn()) systemNotification(r)
      }
    }
    check()
    const id = setInterval(check, 20_000)
    return () => clearInterval(id)
  }, [])
  const loadRef = useRef<() => void>(() => {})

  const busy = () => inflight.current > 0 || queue.current.size > 0

  const load = useCallback(() => {
    if (busy()) { reloadWanted.current = true; return }
    const tz = clockZone() ?? ''
    fetch(`/api/todos${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`)
      .then((r) => {
        // A server that answers with an error is down; one that does not answer at all is, too,
        // unless this device is simply offline (which has its own say, see TuckStatus).
        setDown(r.status >= 500)
        return r.ok ? r.json() : null
      })
      .then((d: TodosPayload | null) => {
        if (!d) return
        // Something was changed while this was in the air: ask again after it.
        if (busy()) { reloadWanted.current = true; return }
        setData(d)
      })
      .catch(() => { if (navigator.onLine) setDown(true) })
  }, [])
  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => { load() }, [load])
  // The assistant, a plan, an approval elsewhere: whatever changed, redraw.
  useDataChanged(load)
  // And whatever changed on another device, a moment later.
  useLiveSync(load)

  // Today rolls over at midnight without anyone touching the page.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && data && todayStr() !== data.date) loadRef.current()
    }, 60_000)
    return () => clearInterval(id)
  }, [data])

  /** Runs a write, and catches up on any reload that waited for it. */
  const run = useCallback(async <T,>(write: () => Promise<T>, thenReload = false): Promise<T | null> => {
    inflight.current++
    setSaving(true)
    try {
      return await write()
    } catch {
      window.dispatchEvent(new Event(SAVE_FAILED))
      return null
    } finally {
      inflight.current--
      if (!busy()) setSaving(false)
      if (thenReload) reloadWanted.current = true
      if (!busy() && reloadWanted.current) { reloadWanted.current = false; loadRef.current() }
    }
  }, [])

  /** Collects changes to one node and writes them once typing rests. */
  const write = useCallback((id: number, changes: Record<string, unknown>) => {
    const pending = queue.current.get(id)
    if (pending) clearTimeout(pending.timer)
    const merged = { ...pending?.changes, ...changes }
    const timer = setTimeout(() => {
      queue.current.delete(id)
      run(() => fetch(`/api/todos/${id}`, json('PATCH', merged)))
    }, WRITE_DELAY_MS)
    queue.current.set(id, { changes: merged, timer })
  }, [run])

  const patch = useCallback((id: number, changes: Partial<Todo>) => {
    // The same rule the server applies: a day and "someday" clear each other.
    const full: Partial<Todo> = { ...changes }
    if (changes.someday) { full.when = null; full.evening = false; full.time = null }
    // A time set by hand is a time agreed to; with no day yet, it is today's.
    if (typeof changes.time === 'string') {
      full.timePlanned = false
      const cur = id === DRAFT_ID ? draftRef.current : todosRef.current.find((t) => t.id === id)
      if (!changes.when && !cur?.when) { full.when = todayStr(); full.someday = false }
    }
    else if (changes.when) full.someday = false
    // A heading is part of one project: moving out of the project drops it.
    if ('listId' in changes && !('headingId' in changes)) full.headingId = null

    if (id === DRAFT_ID) { setDraft((d) => (d ? { ...d, ...full } : d)); return }
    setData((d) => (d ? { ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, ...full } : t)) } : d))
    write(id, full)
  }, [write])

  const toggle = useCallback((todo: Todo) => {
    if (todo.id === DRAFT_ID) return
    const done = !todo.done
    const set = (on: boolean) =>
      setData((d) => (d ? {
        ...d,
        todos: d.todos.map((t) => (t.id === todo.id ? { ...t, done: on, doneAt: on ? new Date().toISOString() : null } : t)),
      } : d))
    const send = (on: boolean) =>
      // The zone goes along: when it was ticked is learned from (src/lib/availability.ts).
      fetch(`/api/todos/${todo.id}`, json('PATCH', { done: on, tz: clockZone() }))

    // Completing a repeating to-do creates its next occurrence, so undo has
    // to remove that as well as untick this one. It may be pressed before the
    // server has answered, so it waits for the answer.
    let spawnedId: number | undefined
    let answered!: () => void
    const settled = new Promise<void>((r) => { answered = r })
    let undone = false
    const undo = async () => {
      if (undone) return
      undone = true
      await settled
      set(!done)
      await run(async () => {
        await send(!done)
        if (spawnedId) await fetch(`/api/nodes/${spawnedId}`, { method: 'DELETE' })
      }, true)
    }

    // Tuck has a word for a to-do ticked off, and needs the lists as they were before it. The word carries the way back.
    if (done && !todo.prayerKey) window.dispatchEvent(new CustomEvent(TICKED, { detail: { id: todo.id, undo } }))
    set(done)
    run(async () => {
      const res = await send(done)
      const { spawned } = ((await res.json().catch(() => ({}))) ?? {}) as { spawned?: { id: number } | null }
      spawnedId = spawned?.id
      answered()
      record(`${done ? 'Completed' : 'Unticked'} “${todo.title || 'New to-do'}”`, undo)
    }, true)
  }, [run, record])

  const resolveEvent = useCallback((event: DayEvent, status: EventStatus | null) => {
    const name = event.title.trim() || 'Event'
    const mark = (s: EventStatus | null) =>
      setData((d) => (d ? { ...d, events: d.events.map((e) => (e.id === event.id && e.date === event.date ? { ...e, status: s } : e)) } : d))
    // Everything for today settled by this one? Tuck has a word; worked out from the lists as they are now.
    if (status && event.date === (data?.date ?? todayStr()) && data) {
      const events = data.events.map((e) => (e.id === event.id && e.date === event.date ? { ...e, status } : e))
      const f = dayFacts({ now: wallNow(), todos: todosRef.current, lists: data.lists, events })
      if (f.open.length === 0 && f.openEvents === 0) window.dispatchEvent(new CustomEvent(SAY, { detail: { state: 'all-done', line: 'All clear. The garden is tidy.' } }))
    }
    const send = (s: EventStatus | null) => fetch(`/api/events/${event.id}/resolve`, json('POST', { date: event.date, status: s }))
    mark(status)
    // Putting it back needs no toast of its own.
    if (!status) { run(() => send(null), true); return }
    run(async () => {
      const res = await send(status)
      if (!res.ok) { mark(null); return }
      let undone = false
      const undo = async () => {
        if (undone) return
        undone = true
        setNote(null)
        mark(null)
        await run(() => send(null), true)
      }
      const word = status === 'attended' ? 'Marked as attended' : status === 'cancelled' ? 'Marked as cancelled' : 'Marked as not attended'
      record(`${word}: “${name}”`, undo)
      setNote({ title: word, detail: `“${name}”`, undo, tone: status === 'attended' ? 'success' : 'info' })
    }, true)
  }, [data, run, record, setNote])

  const skip = useCallback((todo: Todo) => {
    const today = data?.date ?? todayStr()
    const plan = skipPreview(todo, today)
    const name = todo.title.trim() || 'New to-do'
    if (!plan.ok) {
      if (plan.reason === 'last') setNote({ title: 'Nothing to skip to', detail: `“${name}” is on its last time round.`, undo: null, tone: 'warning' })
      return
    }
    const { from, to } = plan
    const move = (day: string) =>
      setData((d) => (d ? { ...d, todos: d.todos.map((t) => (t.id === todo.id ? { ...t, when: day, time: null, timePlanned: false } : t)) } : d))
    // A snooze belonged to the occurrence just skipped.
    move(to)
    run(async () => {
      const res = await fetch(`/api/todos/${todo.id}/skip`, json('POST', { date: from, tz: clockZone() }))
      // Already moved on (another tab, a double click): just show what is true.
      if (!res.ok) return
      let undone = false
      const undo = async () => {
        if (undone) return
        undone = true
        setNote(null)
        move(from)
        await run(() => fetch(`/api/todos/${todo.id}/skip`, json('POST', { undo: true, date: from })), true)
      }
      record(`Skipped “${name}”`, undo)
      setNote({ title: 'Skipped', detail: `“${name}”. Next: ${relDate(to, today)}.`, undo, tone: 'info' })
    }, true)
  }, [data?.date, run, record, setNote])

  /** Deletes a node, keeping what is needed to put it back. */
  /** Deletes a node. With `offer`, the island says so and holds the way back: for what is not worth a confirm dialog because it can be undone. */
  const destroy = useCallback((id: number, label: string, offer?: { title: string; detail: string }) => {
    run(async () => {
      const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE' })
      const { deleted } = ((await res.json().catch(() => ({}))) ?? {}) as { deleted?: Record<string, unknown> }
      if (!deleted) return
      let restored = false
      const undo = async () => {
        if (restored) return
        restored = true
        await run(() => fetch('/api/nodes/restore', json('POST', { ...deleted, previousId: id })), true)
      }
      record(label, undo)
      if (offer) toastUndo(offer.title, offer.detail, undo, 'acture-delete', 'warning', 'looking')
    }, true)
  }, [run, record])

  const remove = useCallback((todo: Todo) => {
    if (todo.id === DRAFT_ID) { setDraft(null); return }
    if (todo.prayerKey) return
    const pending = queue.current.get(todo.id)
    if (pending) { clearTimeout(pending.timer); queue.current.delete(todo.id) }
    setData((d) => (d ? { ...d, todos: d.todos.filter((t) => t.id !== todo.id) } : d))
    destroy(todo.id, `Deleted “${todo.title || 'New to-do'}”`)
  }, [destroy])

  const startDraft = useCallback((defaults: Partial<Todo>) => setDraft(blank(defaults)), [])

  const endDraft = useCallback(() => {
    const d = draft
    if (!d) return
    setDraft(null)
    if (!d.title.trim() && !d.notes.trim() && d.checklist.length === 0) return
    /*
     * Written the way it is said: "Dentist fri 3pm", or the whole line with
     * keywords (src/lib/quick-entry.ts). The editor showed what it would read
     * while it was typed, and offered to keep the words instead, so nothing
     * here is a surprise.
     */
    const e = d.literal ? null : parseEntry(d.title, todayStr())
    const asEvent = e?.kind ? e.kind === 'event' : d.asEvent === true
    const title = (e?.title ?? d.title).trim() || (asEvent ? 'New event' : 'New to-do')
    const when = e && (e.when || e.someday) ? (e.someday ? null : e.when) : d.when
    const time = e?.time ?? d.time
    const minutes = e?.minutes ?? d.minutes
    const repeats = e?.repeats ?? d.repeats
    // "/aui": the project or area whose name starts with it, else one containing it.
    const q = e?.list?.toLowerCase()
    const named = q ? (data?.lists.find((l) => !l.done && l.title.toLowerCase().startsWith(q)) ?? data?.lists.find((l) => !l.done && l.title.toLowerCase().includes(q))) : undefined

    if (asEvent) {
      run(() => fetch('/api/events', json('POST', {
        name: title, date: when ?? todayStr(), time: time ?? undefined, duration: minutes ?? 60,
        location: e?.location ?? d.location ?? '', frequency: repeats ?? 'once',
        daysOfWeek: e?.repeatDays ?? undefined, until: e?.until ?? undefined,
      })), true)
      return
    }
    Object.assign(d, {
      when, time, minutes, repeats,
      evening: e?.evening ?? d.evening,
      someday: e?.someday ?? d.someday,
      deadline: e?.deadline ?? d.deadline,
      reminder: e?.time ?? d.reminder,
      priority: e?.priority ?? d.priority,
      tags: [...new Set([...d.tags, ...(e?.tags ?? [])])],
      listId: named?.id ?? d.listId,
    })
    run(async () => {
      const res = await fetch('/api/todos', json('POST', {
        title, notes: d.notes, when: d.when, evening: d.evening, someday: d.someday, deadline: d.deadline,
        tags: d.tags, checklist: d.checklist, listId: d.listId, headingId: d.headingId, order: d.order, repeats: d.repeats, reminder: d.reminder, time: d.time, minutes: d.minutes,
        priority: d.priority, repeatDays: e?.repeatDays ?? undefined,
      }))
      const { id } = ((await res.json().catch(() => ({}))) ?? {}) as { id?: number }
      // Shown under its real id straight away, so it does not blink out
      // between the draft closing and the next read arriving.
      if (id) setData((cur) => (cur ? { ...cur, todos: [...cur.todos, { ...d, id, title }] } : cur))
    }, true)
  }, [draft, run, data?.lists])

  const patchList = useCallback((id: number, changes: Partial<TodoList>) => {
    const full: Partial<TodoList> = { ...changes }
    if (typeof changes.done === 'boolean') full.doneAt = changes.done ? new Date().toISOString() : null
    setData((d) => (d ? { ...d, lists: d.lists.map((l) => (l.id === id ? { ...l, ...full } : l)) } : d))
    write(id, changes)
  }, [write])

  const createList = useCallback(async (kind: ListKind, areaId: number | null) => {
    const order = Date.now()
    const res = await run(() => fetch('/api/todos', json('POST', { kind, title: '', areaId, order })))
    const { id } = ((await res?.json().catch(() => ({}))) ?? {}) as { id?: number }
    if (!id) return null
    const list: TodoList = { id, kind, title: '', notes: '', headings: [], areaId: kind === 'project' ? areaId : null, deadline: null, hideFromToday: false, done: false, doneAt: null, order }
    setData((d) => (d ? { ...d, lists: [...d.lists, list] } : d))
    return id
  }, [run])

  const removeList = useCallback((list: TodoList) => {
    setData((d) => (d ? {
      ...d,
      lists: d.lists.filter((l) => l.id !== list.id).map((l) => (l.areaId === list.id ? { ...l, areaId: null } : l)),
      todos: d.todos.map((t) => (t.listId === list.id ? { ...t, listId: null } : t)),
    } : d))
    const name = list.title || (list.kind === 'area' ? 'Untitled area' : 'Untitled project')
    destroy(list.id, `Deleted “${name}”. Its to-dos were kept.`, { title: list.kind === 'area' ? 'Area deleted' : 'Project deleted', detail: `“${name}”. Its to-dos were kept.` })
  }, [destroy])

  /** Puts a reminder off: it comes back at the moment chosen, from now. */
  const snooze = useCallback((r: Reminder, minutes: number | null) => {
    const until = snoozeUntil(momentNow(), minutes)
    if (r.kind === 'todo') { patch(r.id, { snoozedUntil: until }); return }
    void fetch(`/api/events/${r.id}`, json('PATCH', { snoozedUntil: until })).then(() => loadRef.current())
  }, [patch])

  // A reminder rings in the island: what it is, and the ways to answer it.
  useEffect(() => {
    remindRef.current = (r: Reminder) => {
      const todo = r.kind === 'todo' ? todosRef.current.find((t) => t.id === r.id) : undefined
      const today = data?.date ?? todayStr()
      const actions: { label: string; primary?: boolean; run: () => void }[] = []
      if (todo && !todo.done) actions.push({ label: 'Done', primary: true, run: () => toggle(todo) })
      if (todo && skipPreview(todo, today).ok) actions.push({ label: 'Skip today', run: () => skip(todo) })
      for (const sn of SNOOZES) actions.push({ label: sn.minutes === null ? sn.label : `Snooze ${sn.label}`, run: () => snooze(r, sn.minutes) })
      toastReminder(`reminder-${r.key}`, r.title, r.body, actions)
    }
  }, [data?.date, toggle, skip, snooze])

  const value = useMemo<TodosContextValue>(() => ({
    ready: data !== null,
    date: data?.date ?? todayStr(),
    todos: draft ? [draft, ...(data?.todos ?? [])] : data?.todos ?? [],
    lists: data?.lists ?? [],
    events: data?.events ?? [],
    patch, toggle, skip, resolveEvent, remove, startDraft, endDraft, patchList, createList, removeList,
    dragId, dragIds, setDragId, setDragIds, plusDragging, setPlusDragging, requestOpen, takeOpenRequest, reload: load,
    saving, down, archived: data?.archived ?? 0,
  }), [data, draft, saving, down, patch, toggle, skip, resolveEvent, remove, startDraft, endDraft, patchList, createList, removeList,
    dragId, dragIds, setDragId, setDragIds, plusDragging, setPlusDragging, requestOpen, takeOpenRequest, load])

  return (
    <TodosContext.Provider value={value}>
      {children}
    </TodosContext.Provider>
  )
}
