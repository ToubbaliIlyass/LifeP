'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { DayEvent, Todo, TodoList, TodosPayload } from '@/lib/todos'
import { useUndo } from '@/components/undo/UndoProvider'
import { useDataChanged } from '@/lib/dataSignal'
import { useLiveSync } from '@/lib/useLiveSync'
import { todayStr } from '@/lib/date'
import { clockZone } from '@/lib/wallclock'
import { safeGet, safeSet } from '@/lib/storage'
import { parseEntry } from '@/lib/quick-entry'
import { Bell, X } from 'lucide-react'
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
  order: 0, repeats: null, repeatDays: null, reminder: null, priority: null, streak: null, ...defaults,
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
  const [ringing, setRinging] = useState<Reminder[]>([])
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
        setRinging((list) => [...list.filter((x) => !(x.kind === r.kind && x.id === r.id)), r])
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
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TodosPayload | null) => {
        if (!d) return
        // Something was changed while this was in the air: ask again after it.
        if (busy()) { reloadWanted.current = true; return }
        setData(d)
      })
      .catch(() => {})
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
    try {
      return await write()
    } catch {
      return null
    } finally {
      inflight.current--
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
      todo.type === 'Prayer' ? fetch('/api/prayers', json('POST', { prayer: todo.prayerKey, done: on }))
        : todo.type === 'Habit' ? fetch(`/api/habits/${todo.id}`, json('PATCH', { completed: on }))
        : fetch(`/api/todos/${todo.id}`, json('PATCH', { done: on }))

    set(done)
    run(async () => {
      const res = await send(done)
      // Completing a repeating to-do creates its next occurrence, so undo has
      // to remove that as well as untick this one.
      const { spawned } = ((await res.json().catch(() => ({}))) ?? {}) as { spawned?: { id: number } | null }
      record(`${done ? 'Completed' : 'Unticked'} “${todo.title || 'New to-do'}”`, async () => {
        set(!done)
        await run(async () => {
          await send(!done)
          if (spawned?.id) await fetch(`/api/nodes/${spawned.id}`, { method: 'DELETE' })
        }, true)
      })
    }, true)
  }, [run, record])

  /** Deletes a node, keeping what is needed to put it back. */
  const destroy = useCallback((id: number, label: string) => {
    run(async () => {
      const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE' })
      const { deleted } = ((await res.json().catch(() => ({}))) ?? {}) as { deleted?: Record<string, unknown> }
      if (!deleted) return
      record(label, async () => {
        await run(() => fetch('/api/nodes/restore', json('POST', { ...deleted, previousId: id })), true)
      })
    }, true)
  }, [run, record])

  const remove = useCallback((todo: Todo) => {
    if (todo.id === DRAFT_ID) { setDraft(null); return }
    if (todo.type === 'Prayer') return
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
    const list: TodoList = { id, kind, title: '', notes: '', headings: [], areaId: kind === 'project' ? areaId : null, deadline: null, done: false, doneAt: null, order }
    setData((d) => (d ? { ...d, lists: [...d.lists, list] } : d))
    return id
  }, [run])

  const removeList = useCallback((list: TodoList) => {
    setData((d) => (d ? {
      ...d,
      lists: d.lists.filter((l) => l.id !== list.id).map((l) => (l.areaId === list.id ? { ...l, areaId: null } : l)),
      todos: d.todos.map((t) => (t.listId === list.id ? { ...t, listId: null } : t)),
    } : d))
    destroy(list.id, `Deleted “${list.title || (list.kind === 'area' ? 'Untitled area' : 'Untitled project')}”. Its to-dos were kept.`)
  }, [destroy])

  /** Puts a reminder off: it comes back at the moment chosen, from now. */
  const snooze = useCallback((r: Reminder, minutes: number | null) => {
    const until = snoozeUntil(momentNow(), minutes)
    if (r.kind === 'todo') { patch(r.id, { snoozedUntil: until }); return }
    void fetch(`/api/events/${r.id}`, json('PATCH', { snoozedUntil: until })).then(() => loadRef.current())
  }, [patch])

  const value = useMemo<TodosContextValue>(() => ({
    ready: data !== null,
    date: data?.date ?? todayStr(),
    todos: draft ? [draft, ...(data?.todos ?? [])] : data?.todos ?? [],
    lists: data?.lists ?? [],
    events: data?.events ?? [],
    patch, toggle, remove, startDraft, endDraft, patchList, createList, removeList,
    dragId, dragIds, setDragId, setDragIds, plusDragging, setPlusDragging, requestOpen, takeOpenRequest, reload: load,
  }), [data, draft, patch, toggle, remove, startDraft, endDraft, patchList, createList, removeList,
    dragId, dragIds, setDragId, setDragIds, plusDragging, setPlusDragging, requestOpen, takeOpenRequest, load])

  return (
    <TodosContext.Provider value={value}>
      {children}
      {ringing.length > 0 && (
        <div className="fixed z-[65] top-4 right-4 flex flex-col gap-2 w-[min(340px,calc(100vw-2rem))]" role="status" aria-live="polite">
          {ringing.map((r) => {
            const todo = r.kind === 'todo' ? data?.todos.find((t) => t.id === r.id) : undefined
            const away = () => setRinging((list) => list.filter((x) => x.key !== r.key))
            return (
              <div key={r.key} className="rounded-xl border border-border/70 bg-card px-3.5 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_28px_rgb(0_0_0/0.14)]">
                <div className="flex items-start gap-3">
                  <Bell className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{r.title}</p>
                    <p className="text-[12.5px] text-muted-foreground tabular-nums">{r.body}</p>
                  </div>
                  <button onClick={away} aria-label="Put away" className="shrink-0 grid place-items-center w-6 h-6 -mr-1 rounded-md text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pl-7">
                  {todo && !todo.done && (
                    <button onClick={() => { toggle(todo); away() }} className="rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[12.5px] font-semibold hover:opacity-90">Done</button>
                  )}
                  {SNOOZES.map((s) => (
                    <button key={s.label} onClick={() => { snooze(r, s.minutes); away() }} className="rounded-md border border-border/80 px-2 py-1 text-[12.5px] font-medium hover:bg-foreground/[0.05]">
                      {s.minutes === null ? s.label : `Snooze ${s.label}`}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </TodosContext.Provider>
  )
}
