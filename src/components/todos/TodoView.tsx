'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Archive, Bell, CalendarDays, CalendarPlus, Check, ChevronDown, Clock, Ellipsis, ChevronLeft, FileText, GripVertical, Flag, Flame, Heading, Inbox, Layers, ListChecks, Loader2, Moon, Plus,
  Repeat, SkipForward, Sparkles, Square, Star, Tag, Trash2, X,
} from 'lucide-react'
import { parseWhen } from '@/lib/jump-start'
import type { DayEvent, Todo, TodoList } from '@/lib/todos'
import { UPCOMING_DAYS } from '@/lib/todos'
import {
  DAYS, MONTHS_LONG, STANDARD_VIEWS, byDay, byOrder, deadlineLabel, inDoneList, inInbox, isAnytime, isSomeday, isToday,
  canSkip, isUpcoming, parseDay, skipLabel, progress, relDate, repeatLabel, upcomingDay, type StandardView,
} from '@/lib/todo-views'
import { addDays } from '@/lib/date'
import { clockZone } from '@/lib/wallclock'
import { notifyDataChanged } from '@/lib/dataSignal'
import { Tuck } from '@/components/ui/Tuck'
import type { TuckState } from '@/lib/tuck/states'
import { DRAFT_ID, useTodos } from './TodosProvider'
import { AutoTextarea, TodoEditor, reminderLabel, type PopKind } from './TodoEditor'
import { askForNotifications } from '@/lib/notify'
import { lead as leadTime } from '@/lib/reminders'
import { wallNow } from '@/lib/wallclock'
import { EventEditor } from './EventEditor'
import { EVENING_TONE, ProgressRing, SOMEDAY_TONE, TodoCheck, VIEW_META } from './parts'

type Ctx = 'today' | 'inbox' | 'upcoming' | 'anytime' | 'someday' | 'project' | 'area' | 'logbook' | 'tag'
type PopState = { kind: PopKind | 'list' | 'heading' | 'event'; event?: DayEvent; rect: DOMRect; todoId?: number; headingId?: string; batch?: boolean }

const MENU = 'flex items-center gap-2.5 w-full text-left px-2.5 py-[7px] rounded-[7px] text-[14px] hover:bg-foreground/[0.045] focus-visible:bg-foreground/[0.045] outline-none'
/*
 * One left edge. The list's icon, its notes, the tag filter, every heading and
 * every checkbox start on the same line down the page; a row's highlight is
 * the only thing allowed to reach past it. Sizes follow Things: a quiet 14px
 * list under a 22px title, with headings as coloured rules.
 */
const SECTION_BASE = 'flex items-center gap-2 text-[14px] font-bold mt-8 mb-1 pb-1.5 border-b border-border/80'
const SECTION = `${SECTION_BASE} text-primary`
const ROW = 'relative flex items-start gap-2 px-2 -mx-2 py-1 rounded-md leading-[22px] cursor-default'
const DATE_CHIP = 'shrink-0 rounded-[4px] bg-foreground/[0.07] px-1.5 text-[11.5px] font-medium leading-[18px] text-muted-foreground tabular-nums'
const TAG_PILL = 'shrink-0 rounded-full border border-border px-1.5 text-[11px] leading-4 text-muted-foreground'
const ICON_BTN = 'grid place-items-center w-7 h-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] disabled:opacity-50'

/** A menu, placed under whatever opened it and kept on the screen. */
function Pop({ rect, onClose, children }: { rect: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))
    let top = rect.bottom + 6
    if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - el.offsetHeight - 6)
    setPos({ left, top })
  }, [rect])
  return (
    <>
      <div data-pop className="fixed inset-0 z-[55]" onMouseDown={onClose} />
      <div
        ref={ref}
        data-pop
        role="menu"
        style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}
        className="fixed z-[56] min-w-[220px] max-w-[280px] max-h-[min(420px,70vh)] overflow-y-auto p-1.5 rounded-xl border border-border/70 bg-popover shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_28px_rgb(0_0_0/0.14)]"
      >
        {children}
      </div>
    </>
  )
}

const PopHead = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-muted-foreground">{children}</div>
)

function DateRow({ Icon, label, value, onPick }: { Icon: React.ComponentType<{ className?: string }>; label: string; value: string | null; onPick: (date: string) => void }) {
  return (
    <label className={`${MENU} cursor-pointer`}>
      <Icon className="w-[18px] h-[18px]" />
      <span className="flex-1">{label}</span>
      <input
        type="date"
        defaultValue={value ?? ''}
        aria-label={label}
        onChange={(e) => { if (e.target.value) onPick(e.target.value) }}
        className="max-w-[132px] text-[13px] rounded-md border border-border/70 bg-background px-1 py-0.5"
      />
    </label>
  )
}

/**
 * One list, whichever it is.
 *
 * Inbox, Today, a project and the rest differ only in which to-dos they ask
 * for and how they group them (src/lib/todo-views.ts); a row, the editor it
 * opens into, the keyboard and dragging are the same everywhere.
 */
export function TodoView({
  view, stretched = false, onNavigate, onOpenMenu, onQuickFind, dock, banner,
}: {
  view: string
  /** Run the list the full width of the window instead of one column. */
  stretched?: boolean
  onNavigate: (view: string) => void
  onOpenMenu: () => void
  /** Opens Quick Find, with whatever was already typed. */
  onQuickFind: (initial: string) => void
  /** The assistant's bar, pinned under the list in the list's own column. */
  dock?: React.ReactNode
  /** Shown above whichever list is open — the evening check-in. */
  banner?: React.ReactNode
}) {
  const {
    ready, down, todos, lists, events, date: today, patch, toggle, skip, remove, startDraft, endDraft,
    patchList, removeList, dragId, dragIds, setDragId, setDragIds, plusDragging, setPlusDragging, takeOpenRequest, reload,
  } = useTodos()

  // A draft started from a list that cannot hold one (the Logbook, a search)
  // arrives here already begun: open it, as it was about to be.
  // Quick Find may have sent us here to open one particular to-do.
  const [openId, setOpenId] = useState<number | null>(() => (todos.some((t) => t.id === DRAFT_ID) ? DRAFT_ID : takeOpenRequest()))
  const [focusTitle, setFocusTitle] = useState(openId !== null)
  const [sel, setSel] = useState<number | null>(openId)
  const [tag, setTag] = useState<string | null>(null)
  /** The Logbook's older days, put away until asked for. */
  const [archiveOpen, setArchiveOpen] = useState(false)
  /** Ticked off while this list was open: they stay put until you leave. */
  const [justDone, setJustDone] = useState<Set<number>>(() => new Set())
  const [showLogged, setShowLogged] = useState(false)
  const [pop, setPop] = useState<PopState | null>(null)
  const [hint, setHint] = useState<{ id: number; before: boolean } | null>(null)
  const [planning, setPlanning] = useState(false)
  /** The heading a dragged to-do is over. */
  const [dropHeading, setDropHeading] = useState<string | null>(null)
  const [planNote, setPlanNote] = useState<string | null>(null)
  /** More than one to-do, chosen with ⌘- or shift-click, to act on together. */
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  /** The heading being dragged to a new place. */
  const [dragHeading, setDragHeading] = useState<string | null>(null)
  /** What is typed into the Move menu's filter, and the When menu's Jump Start. */
  const [quickFilter, setQuickFilter] = useState('')
  const [jump, setJump] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  const listId = view.startsWith('project:') || view.startsWith('area:') ? Number(view.split(':')[1]) : null
  /** Every list, filtered by one tag: where Quick Find takes a #tag. */
  const tagView = view.startsWith('tag:') ? view.slice(4) : null
  const list = listId !== null ? lists.find((l) => l.id === listId) ?? null : null
  const byId = (id: number | null | undefined) => todos.find((t) => t.id === id)

  const shown = (t: Todo) => !t.done || justDone.has(t.id)
  const live = (t: Todo) => shown(t) && !inDoneList(t, lists)
  const tagged = (t: Todo) => !tag || t.tags.includes(tag)

  // ── Doing things ─────────────────────────────────────────────────────

  function closeEditor() {
    if (openId === DRAFT_ID) endDraft()
    setOpenId(null)
  }
  // Leaving the list with a draft open keeps what was typed.
  const leave = useRef(() => {})
  useEffect(() => { leave.current = () => { if (openId === DRAFT_ID) endDraft() } })
  useEffect(() => () => leave.current(), [])

  function open(id: number, focus = false) {
    if (openId !== null && openId !== id) closeEditor()
    setFocusTitle(focus)
    setOpenId(id)
    setSel(id)
  }

  function complete(t: Todo) {
    setJustDone((s) => {
      const next = new Set(s)
      if (t.done) next.delete(t.id)
      else next.add(t.id)
      return next
    })
    toggle(t)
  }

  function destroy(t: Todo) {
    if (openId === t.id) setOpenId(null)
    if (sel === t.id) setSel(null)
    remove(t)
  }

  function newTodo(headingId: string | null = null) {
    if (openId !== null) closeEditor()
    const order = todos.reduce((m, t) => Math.min(m, t.order), 0) - 1
    const base: Partial<Todo> = { order, tags: tag ? [tag] : [], headingId }
    if (view === 'today') startDraft({ ...base, when: today })
    else if (view === 'upcoming') startDraft({ ...base, when: addDays(today, 1) })
    else if (view === 'someday') startDraft({ ...base, someday: true })
    else if (list && !list.done) startDraft({ ...base, listId: list.id })
    else {
      startDraft(base)
      if (view !== 'inbox' && view !== 'anytime') onNavigate('inbox')
    }
    setFocusTitle(true)
    setOpenId(DRAFT_ID)
    setSel(DRAFT_ID)
  }

  /** Something to show up to — a class, an appointment — written in the list like a to-do. */
  function newEvent(day: string) {
    if (openId !== null) closeEditor()
    startDraft({ asEvent: true, when: day, order: todos.reduce((m, t) => Math.min(m, t.order), 0) - 1 })
    setFocusTitle(true)
    setOpenId(DRAFT_ID)
    setSel(DRAFT_ID)
  }

  /** A new to-do exactly where the + was dropped, with whatever that place implies. */
  function insertAt(changes: Partial<Todo>) {
    if (openId !== null) closeEditor()
    const base: Partial<Todo> = { tags: tag ? [tag] : [] }
    if (view === 'today') base.when = today
    else if (view === 'someday') base.someday = true
    else if (list && !list.done) base.listId = list.id
    startDraft({ ...base, ...changes })
    setFocusTitle(true)
    setOpenId(DRAFT_ID)
    setSel(DRAFT_ID)
  }

  /** The to-dos an action applies to: everything picked, or else the one in hand. */
  const targets = (t: Todo | undefined) => (picked.size > 1 && t && picked.has(t.id) ? [...picked].map(byId).filter((x): x is Todo => !!x) : t ? [t] : [])

  function pick(t: Todo, e: React.MouseEvent) {
    // Shift: everything between the last chosen and this one, in the order on screen.
    if (e.shiftKey && sel !== null) {
      const order = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-todo-id]') ?? [])].map((r) => Number(r.dataset.todoId))
      const [a, b] = [order.indexOf(sel), order.indexOf(t.id)].sort((x, y) => x - y)
      if (a >= 0 && b >= 0) setPicked(new Set(order.slice(a, b + 1).filter((id) => id > 0)))
      return
    }
    setPicked((cur) => {
      const next = new Set(cur.size ? cur : sel !== null && sel > 0 ? [sel] : [])
      if (next.has(t.id)) next.delete(t.id)
      else next.add(t.id)
      return next
    })
    setSel(t.id)
  }

  async function planDay() {
    if (planning) return
    setPlanning(true)
    setPlanNote(null)
    const res = await fetch('/api/schedule/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tz: clockZone() }),
    }).catch(() => null)
    const d = ((await res?.json().catch(() => null)) ?? null) as { scheduled?: number; unplaced?: unknown[] } | null
    setPlanning(false)
    if (!res?.ok || !d) { setPlanNote('Could not plan the day just now.'); return }
    const left = d.unplaced?.length ?? 0
    setPlanNote(
      d.scheduled ? `Gave ${d.scheduled} a time${left ? ` · ${left} had no room` : ''}.`
        : left ? `No room left today for ${left}.` : 'Nothing left to place.',
    )
    notifyDataChanged()
    reload()
  }

  // Clicking away from an open to-do closes it. Menus are part of it.
  useEffect(() => {
    if (openId === null) return
    function onDown(e: MouseEvent) {
      const el = e.target as HTMLElement
      if (el.closest('[data-editor],[data-pop]')) return
      closeEditor()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  // ── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement
      if (e.key === 'Escape') {
        if (pop) { setPop(null); return }
        if (openId !== null) { closeEditor(); return }
        if (picked.size) { setPicked(new Set()); return }
        if (sel !== null) { setSel(null); return }
        return
      }
      if (el.closest('input,textarea,select,[contenteditable]')) return
      if (el.closest('button,a,label') && (e.key === 'Enter' || e.key === ' ')) return
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return

      const current = byId(sel)
      const move = (dir: number) => {
        const rows = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-todo-id]') ?? [])]
        if (!rows.length) return
        let i = rows.findIndex((r) => Number(r.dataset.todoId) === sel)
        i = i < 0 ? (dir > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + dir))
        setSel(Number(rows[i].dataset.todoId))
        rows[i].scrollIntoView({ block: 'nearest' })
      }
      switch (e.key) {
        case 'N': {
          // Shift+N: something to show up to, on the day this list is about.
          e.preventDefault()
          newEvent(view === 'upcoming' ? addDays(today, 1) : today)
          break
        }
        case 'n': {
          // Under the heading of whatever is selected, so a section can be filled in a run.
          e.preventDefault()
          newTodo(current?.listId === listId ? current?.headingId ?? null : null)
          break
        }
        case 'ArrowDown': e.preventDefault(); move(1); break
        case 'ArrowUp': e.preventDefault(); move(-1); break
        case 'Enter': if (current && current.type !== 'Prayer') { e.preventDefault(); open(current.id, true) } break
        case ' ': if (current) { e.preventDefault(); for (const t of targets(current)) complete(t) } break
        case 'Backspace': case 'Delete': if (current && current.type !== 'Prayer') { e.preventDefault(); for (const t of targets(current)) destroy(t); setPicked(new Set()) } break
        case 't': if (current?.type === 'Task') { for (const t of targets(current)) patch(t.id, { when: today, evening: false }); break }
        // falls through: with nothing selected, t is the start of a word
        case 'e': if (e.key === 'e' && current?.type === 'Task') { for (const t of targets(current)) patch(t.id, { when: today, evening: true }); break }
        // falls through
        default:
          // Things' Quick Find: with nothing in hand, typing is searching.
          // / (search) is the page's own, so it is left to it.
          if (e.key.length === 1 && /\S/.test(e.key) && e.key !== '/' && !current) { e.preventDefault(); onQuickFind(e.key) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Rows ─────────────────────────────────────────────────────────────

  /** What comes before a title: when it is, as a chip or a mark. */
  function lead(t: Todo, ctx: Ctx) {
    const m: React.ReactNode[] = []
    // A time belongs where the day is the frame — Today and Upcoming. In
    // Anytime or a project the star already says "today"; a bare 20:30 there
    // reads as a list sorted by the clock, which it is not.
    if (t.time && !t.done && (ctx === 'today' || ctx === 'upcoming')) {
      m.push(
        <span key="time" title={t.timePlanned ? 'Where the plan put it — set a time to keep it there' : undefined} className={`${DATE_CHIP} ${t.timePlanned ? 'opacity-60' : 'text-foreground/80'}`}>
          {t.time}
        </span>,
      )
    }
    // A reminder at the to-do's own time is one chip, not two.
    const bell = reminderLabel(t, today)
    if (bell && !t.done && !(t.reminder === t.time && !t.remindBefore && !t.remindAt)) m.push(<span key="bell" className={`${DATE_CHIP} inline-flex items-center gap-0.5`}><Bell className="w-[10px] h-[10px]" />{bell}</span>)
    if (bell && !t.done && t.reminder === t.time && !t.remindBefore && !t.remindAt) m.push(<Bell key="bell" aria-label="Reminds you" className="w-[11px] h-[11px] shrink-0 text-muted-foreground" />)
    if (t.type !== 'Task') return m
    if (t.priority === 'high' && !t.done) m.push(<span key="prio" aria-label="High priority" className="shrink-0 font-bold text-red-500 leading-none">!!</span>)
    if (ctx !== 'today' && !t.done && t.when && t.when <= today) {
      m.push(t.evening
        ? <Moon key="when" aria-label="This evening" className={`w-[13px] h-[13px] shrink-0 ${EVENING_TONE}`} />
        : <Star key="when" aria-label="Today" className="w-[13px] h-[13px] shrink-0 text-amber-400 fill-amber-400" />)
    }
    if (ctx !== 'upcoming' && t.when && t.when > today) m.push(<span key="when" className={DATE_CHIP}>{relDate(t.when, today)}</span>)
    if (ctx !== 'someday' && t.someday) m.push(<Archive key="some" aria-label="Someday" className={`w-[13px] h-[13px] shrink-0 ${SOMEDAY_TONE}`} />)
    return m
  }

  /** What follows a title on the same line: small marks, then tags. */
  function trail(t: Todo) {
    const m: React.ReactNode[] = []
    const mark = 'w-[13px] h-[13px] shrink-0 text-muted-foreground/70'
    if (t.repeats && t.type !== 'Prayer') m.push(<span key="rep" title={repeatLabel(t.repeats)}><Repeat className={mark} /></span>)
    if (t.notes.trim()) m.push(<span key="notes" title="Has notes"><FileText className={mark} /></span>)
    if (t.checklist.length) {
      m.push(
        <span key="cl" className="inline-flex items-center gap-0.5 text-[11.5px] text-muted-foreground/80 tabular-nums">
          <ListChecks className={mark} />{t.checklist.filter((c) => c.done).length}/{t.checklist.length}
        </span>,
      )
    }
    if (t.streak && t.streak > 1) {
      m.push(<span key="streak" className="inline-flex items-center gap-0.5 text-[11.5px] text-amber-600 dark:text-amber-400"><Flame className="w-[13px] h-[13px]" />{t.streak}</span>)
    }
    for (const g of t.tags) m.push(<span key={`#${g}`} className={TAG_PILL}>{g}</span>)
    return m
  }

  /** The project or area a to-do belongs to, under its title — only where the list does not already say. */
  function place(t: Todo, ctx: Ctx) {
    if (ctx === 'project') return null
    const l = lists.find((x) => x.id === t.listId)
    if (!l || (l.kind === 'area' && ctx === 'area')) return null
    return (
      <div className="flex items-center gap-1 text-[12px] leading-4 text-muted-foreground">
        {l.kind === 'project' && <ProgressRing value={progress(l, todos)} size={11} />}
        <span className="truncate">{l.title || (l.kind === 'project' ? 'Untitled project' : 'Untitled area')}</span>
      </div>
    )
  }

  /** Where a to-do dropped among `siblings` lands, and what the section it landed in changes. */
  /** What landing in a section means, beyond the position. */
  function sectionChanges(section: string, t?: Todo): Partial<Todo> {
    if (section === 'evening' && !t?.evening) return { when: today, evening: true }
    if (section === 'today' && (t?.evening ?? true)) return { when: today, evening: false }
    if (section.startsWith('day:') && t?.when !== section.slice(4)) return { when: section.slice(4), evening: false }
    // Inside a project, each heading's list is a section: "h:" alone is the loose ones above them.
    if (section.startsWith('h:')) return { headingId: section.slice(2) || null }
    return {}
  }

  function dropOnRow(target: Todo, siblings: Todo[], section: string) {
    const before = hint?.before ?? true
    setHint(null)
    const group = dragIds().map(byId).filter((t): t is Todo => !!t && t.id !== target.id)
    const plus = plusDragging()
    setDragIds([])
    setPlusDragging(false)
    const moving = new Set(group.map((t) => t.id))
    const rest = siblings.filter((t) => !moving.has(t.id))
    const at = rest.findIndex((t) => t.id === target.id) + (before ? 0 : 1)
    const prev = rest[at - 1]
    const next = rest[at]
    // Room for however many are landing, between the two they land between.
    const count = Math.max(group.length, 1)
    const start = prev ? prev.order : next ? next.order - count - 1 : 0
    const step = prev && next ? (next.order - prev.order) / (count + 1) : 1
    if (plus) {
      insertAt({ order: start + step, ...sectionChanges(section) })
      return
    }
    group.forEach((t, i) => {
      patch(t.id, { order: start + step * (i + 1), ...(t.type === 'Task' ? sectionChanges(section, t) : {}) })
    })
  }

  function row(t: Todo, ctx: Ctx, siblings: Todo[], section: string) {
    if (openId === t.id) {
      return (
        <TodoEditor
          key={t.id}
          todo={t}
          lists={lists}
          today={today}
          autoFocus={focusTitle}
          onPatch={(changes) => patch(t.id, changes)}
          onToggle={() => complete(t)}
          onSkip={canSkip(t) ? () => skip(t) : undefined}
          onDelete={() => destroy(t)}
          onClose={closeEditor}
          onPop={(kind, anchor) => setPop({ kind, rect: anchor.getBoundingClientRect(), todoId: t.id })}
        />
      )
    }
    const fixed = t.type === 'Prayer'
    const due = t.deadline && !t.done ? deadlineLabel(t.deadline, today) : null
    return (
      <li
        key={t.id}
        data-todo-id={t.id}
        draggable={!fixed}
        onDragStart={(e) => {
          setDragIds(picked.has(t.id) && picked.size > 1 ? [...picked] : [t.id])
          e.dataTransfer.setData('text/plain', String(t.id))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => { setDragId(null); setHint(null) }}
        onDragOver={(e) => {
          if (fixed || (!plusDragging() && (dragId() === null || dragId() === t.id))) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const before = e.clientY < r.top + r.height / 2
          if (hint?.id !== t.id || hint.before !== before) setHint({ id: t.id, before })
        }}
        onDrop={(e) => { e.preventDefault(); dropOnRow(t, siblings, section) }}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) { if (!fixed) pick(t, e); return }
          setPicked(new Set())
          if (fixed) setSel(t.id)
          else open(t.id)
        }}
        className={`${ROW} group/row select-none ${sel === t.id || picked.has(t.id) ? 'bg-primary/[0.12]' : 'hover:bg-foreground/[0.04]'}`}
      >
        {hint?.id === t.id && (
          <span className={`absolute left-2 right-2 h-0.5 rounded bg-primary ${hint.before ? '-top-px' : '-bottom-px'}`} />
        )}
        <TodoCheck done={t.done} onClick={() => complete(t)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5">
            {lead(t, ctx)}
            <span className={`min-w-0 [overflow-wrap:anywhere] ${t.done ? 'text-muted-foreground line-through' : ''}`}>
              {t.title.trim() || <span className="text-muted-foreground/50">New to-do</span>}
            </span>
            {trail(t)}
          </div>
          {place(t, ctx)}
        </div>
        {due && (
          <span className={`shrink-0 inline-flex items-center gap-1 text-[12px] ${due.tone === 'over' ? 'text-red-500 font-semibold' : due.tone === 'soon' ? 'text-amber-500' : 'text-muted-foreground'}`}>
            <Flag className="w-3 h-3" />{due.text}
          </span>
        )}
        {/* One time round of a repeating to-do, put off; it carries on after. Always there on a phone, which has no hover. */}
        {canSkip(t) && (
          <button
            type="button"
            title={skipLabel(t, today)}
            aria-label={`${skipLabel(t, today)}: ${t.title.trim() || 'to-do'}`}
            onClick={(e) => { e.stopPropagation(); skip(t) }}
            className={`${ICON_BTN} -my-0.5 -mr-1 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-md:opacity-100 [@media(hover:none)]:opacity-100`}
          >
            <SkipForward className="w-[15px] h-[15px]" />
          </button>
        )}
      </li>
    )
  }

  /**
   * A repeating to-do on a day it has not reached yet: shown so the week reads
   * true, but quiet and not tickable — it becomes a real to-do when its day
   * comes, or when the one before it is done.
   */
  const ghosts = (day: string) => {
    const dow = parseDay(day).getDay()
    return todos
      .filter((t) => t.repeats && !t.done && t.type !== 'Prayer' && tagged(t)
        && (t.type === 'Habit' || (t.when !== null && t.when < day))
        // Nothing comes round after its deadline.
        && (!t.deadline || day <= t.deadline)
        && (t.repeatDays === null || t.repeatDays.includes(dow)))
      .sort(byOrder)
      .map((t) => (
        <li key={`ghost-${t.id}-${day}`} className={`${ROW} opacity-55`} title="Comes round on this day">
          <span className="w-[15px] h-[15px] mt-[3.5px] shrink-0 rounded-[4px] border-[1.5px] border-dashed border-muted-foreground/50" />
          <span className="min-w-0 flex-1 truncate">{t.title}</span>
          <Repeat className="w-[13px] h-[13px] mt-1 shrink-0 text-muted-foreground" />
        </li>
      ))
  }

  const rows = (items: Todo[], ctx: Ctx, section: string) => (
    <ul className="min-h-1.5">{items.map((t) => row(t, ctx, items, section))}</ul>
  )

  /**
   * What is on the calendar that day, in one quiet box above the to-dos: it
   * happens whether or not anything is ticked, so it is read, not worked through.
   */
  const eventRows = (items: DayEvent[]) => items.length > 0 && (
    <ul className="my-2 rounded-md bg-foreground/[0.05] px-2.5 py-1.5 text-[13px] leading-[19px]">
      {items.map((e) => (
        <li key={`${e.id}:${e.date}`} onClick={(ev) => setPop({ kind: 'event', rect: ev.currentTarget.getBoundingClientRect(), event: e })} className="flex items-baseline gap-1.5 cursor-pointer hover:text-primary">
          <span className="w-[3px] h-[11px] self-center shrink-0 rounded-full bg-sky-500/70" />
          {e.time && <span className="shrink-0 tabular-nums font-medium text-sky-700 dark:text-sky-400">{e.time}</span>}
          <span className="min-w-0 truncate">{e.title}</span>
          {e.location && <span className="min-w-0 truncate text-muted-foreground">· {e.location}</span>}
        </li>
      ))}
    </ul>
  )

  const listRow = (l: TodoList, note?: string) => (
    <li
      key={l.id}
      onClick={() => onNavigate(`${l.kind}:${l.id}`)}
      className={`${ROW} cursor-pointer hover:bg-foreground/[0.04]`}
    >
      {l.kind === 'project'
        ? <ProgressRing value={progress(l, todos)} size={15} className="text-primary mt-[3.5px]" />
        : <Square className="w-[15px] h-[15px] mt-[3.5px] text-muted-foreground" />}
      <div className="flex-1 min-w-0">
        <div className={`leading-[22px] ${l.done ? 'text-muted-foreground line-through' : ''}`}>
          {l.title || (l.kind === 'project' ? 'Untitled project' : 'Untitled area')}
        </div>
        <div className="flex flex-wrap gap-x-2.5 text-[12px] leading-4 text-muted-foreground">
          {note && <span>{note}</span>}
          {l.deadline && !l.done && <span className="inline-flex items-center gap-1"><Flag className="w-[13px] h-[13px]" />Due {relDate(l.deadline, today)}</span>}
        </div>
      </div>
    </li>
  )

  // ── Furniture ────────────────────────────────────────────────────────

  // Things keeps the top of a list bare — a title and nothing shouting beside
  // it — so what can be done here is two quiet icons at the far end.
  const addButton = () => (
    <button
      onClick={() => newTodo()}
      title="New to-do (N) — or drag it to where it should go"
      aria-label="New to-do"
      draggable
      onDragStart={(e) => { setDragIds([]); setPlusDragging(true); e.dataTransfer.setData('text/plain', 'new'); e.dataTransfer.effectAllowed = 'copy' }}
      onDragEnd={() => { setPlusDragging(false); setHint(null) }}
      className={`${ICON_BTN} max-md:hidden cursor-grab`}
    >
      <Plus className="w-[18px] h-[18px]" />
    </button>
  )
  const eventButton = (day: string) => (
    <button
      onClick={() => newEvent(day)}
      title="New event — something you show up to (Shift+N)"
      aria-label="New event"
      className={ICON_BTN}
    >
      <CalendarPlus className="w-[17px] h-[17px]" />
    </button>
  )
  /*
   * On a phone a list is a page of its own, as in Things: a bar with the way
   * back to the lists, then the title under it. The lists are the screen you
   * came from, not a drawer. The mic is in the island at the foot.
   */
  const phoneBar = (
    <div className="md:hidden flex items-center h-9 -mx-1.5 mb-2">
      <button onClick={onOpenMenu} aria-label="Back to lists" className="grid place-items-center w-9 h-9 rounded-md text-muted-foreground active:bg-foreground/[0.06]">
        <ChevronLeft className="w-6 h-6" />
      </button>
    </div>
  )
  const TITLE = 'min-w-0 flex items-center gap-2.5 text-[22px] font-bold leading-7 tracking-tight'
  const head = (icon: React.ReactNode, title: React.ReactNode, actions?: React.ReactNode, sub?: React.ReactNode) => (
    <>
      <header className="flex items-center gap-2 mb-2">
        <h1 className={TITLE}>{icon}{title}</h1>
        <span className="flex-1" />
        {actions}
      </header>
      {sub ? <div className="mb-4 text-[14px] text-foreground/75">{sub}</div> : <div className="h-2" />}
    </>
  )
  const standardHead = (id: StandardView, actions?: React.ReactNode, sub?: React.ReactNode) => {
    const { title, Icon, tone } = VIEW_META[id]
    return head(<Icon className={`w-[22px] h-[22px] shrink-0 ${tone}`} />, title, actions, sub)
  }
  const tagBar = (pool: Todo[]) => {
    const tags = [...new Set(pool.flatMap((t) => t.tags))].sort()
    if (!tags.length) return null
    const chip = (on: boolean) =>
      `text-[12.5px] leading-5 rounded-full px-2.5 font-semibold ${on ? 'bg-foreground/[0.14] text-foreground' : 'text-muted-foreground hover:text-foreground'}`
    return (
      <div className="flex flex-wrap items-center gap-1 mt-3 mb-2 -ml-px">
        <button className={chip(!tag)} onClick={() => setTag(null)}>All</button>
        {tags.map((g) => <button key={g} className={chip(tag === g)} onClick={() => setTag(g)}>{g}</button>)}
      </div>
    )
  }
  /** Nothing here yet, with Tuck beside it: quiet for a clear inbox or day, a bare bed for the rest. */
  const empty = (title: string, text: string, tuck: TuckState = 'empty-garden') => (
    <div className="mt-8 flex items-center gap-5 max-w-[60ch] text-muted-foreground max-sm:flex-col max-sm:items-start max-sm:gap-2">
      <Tuck state={tuck} size={156} decorative className="max-sm:-ml-2" />
      <div>
        <b className="block mb-1 font-semibold text-foreground">{title}</b>
        {text}
      </div>
    </div>
  )

  /** Loose to-dos, then each project, then each area with its own. */
  function byPlace(items: Todo[], ctx: Ctx) {
    const out: React.ReactNode[] = []
    const loose = items.filter((t) => !t.listId).sort(byOrder)
    if (loose.length) out.push(<div key="loose">{rows(loose, ctx, 'loose')}</div>)
    const areas = lists.filter((l) => l.kind === 'area' && !l.done).sort(byOrder)
    const areaIds = new Set(areas.map((a) => a.id))
    const block = (p: TodoList) => {
      const mine = items.filter((t) => t.listId === p.id).sort(byOrder)
      if (!mine.length) return null
      return (
        <div key={p.id}>
          <h3 onClick={() => onNavigate(`project:${p.id}`)} className="flex items-center gap-2 mt-5 mb-0.5 text-[13.5px] font-semibold cursor-pointer hover:text-primary">
            <ProgressRing value={progress(p, todos)} size={15} className="text-primary" />{p.title || 'Untitled project'}
          </h3>
          {rows(mine, 'project', `p:${p.id}`)}
        </div>
      )
    }
    const projects = lists.filter((l) => l.kind === 'project' && !l.done).sort(byOrder)
    for (const p of projects.filter((p) => !p.areaId || !areaIds.has(p.areaId))) out.push(block(p))
    for (const a of areas) {
      const own = items.filter((t) => t.listId === a.id).sort(byOrder)
      const inner = projects.filter((p) => p.areaId === a.id).map(block).filter(Boolean)
      if (!own.length && !inner.length) continue
      out.push(
        <div key={a.id}>
          <h2 onClick={() => onNavigate(`area:${a.id}`)} className={`${SECTION} cursor-pointer hover:text-primary`}>
            <Square className="w-[15px] h-[15px]" />{a.title || 'Untitled area'}
          </h2>
          {own.length > 0 && rows(own, 'area', `a:${a.id}`)}
          {inner}
        </div>,
      )
    }
    return out
  }

  // ── The lists ────────────────────────────────────────────────────────

  function body(): React.ReactNode {
    if (view === 'today') {
      const all = todos.filter((t) => live(t) && isToday(t, today)).sort(byDay)
      const f = all.filter(tagged)
      const evening = f.filter((t) => t.evening)
      const d = parseDay(today)
      const todayEvents = events.filter((e) => e.date === today)
      const canPlan = all.some((t) => !t.done && t.type !== 'Prayer' && !t.time)
      return (
        <>
          {standardHead(
            'today',
            <>
              {canPlan && (
                <button onClick={planDay} disabled={planning} title="Plan my day: give everything left a time" aria-label="Plan my day" className={ICON_BTN}>
                  {planning ? <Loader2 className="w-[17px] h-[17px] animate-spin" /> : <Sparkles className="w-[17px] h-[17px]" />}
                </button>
              )}
              {eventButton(today)}
              {addButton()}
            </>,
            // Only once loaded: until then `today` is the server's clock on
            // the server and the pinned zone's here, and the two can be a day apart.
            ready && <>{DAYS[d.getDay()]}, {d.getDate()} {MONTHS_LONG[d.getMonth()]}{planNote && <span className="ml-2 text-foreground/70">· {planNote}</span>}</>,
          )}
          {tagBar(all)}
          {eventRows(todayEvents)}
          {all.length === 0 && todayEvents.length === 0
            ? empty('A clear day.', 'Say what needs to happen, or press N and type it: “call the bank 3pm”. For something you show up to, use the calendar button above.', 'empty-inbox')
            : rows(f.filter((t) => !t.evening), 'today', 'today')}
          {evening.length > 0 && (
            <>
              <h2 className={`${SECTION_BASE} ${EVENING_TONE}`}><Moon className="w-[15px] h-[15px]" />This evening</h2>
              {rows(evening, 'today', 'evening')}
            </>
          )}
        </>
      )
    }

    if (view === 'inbox') {
      const all = todos.filter((t) => shown(t) && inInbox(t)).sort(byOrder)
      return (
        <>
          {standardHead('inbox', addButton())}
          {tagBar(all)}
          {all.length === 0
            ? empty('Inbox zero.', 'New to-dos land here until you give them a day or a place.', 'empty-inbox')
            : rows(all.filter(tagged), 'inbox', 'inbox')}
        </>
      )
    }

    if (view === 'upcoming') {
      const all = todos.filter((t) => live(t) && isUpcoming(t, today))
      const f = all.filter(tagged)
      const horizon = addDays(today, UPCOMING_DAYS)
      const later = f.filter((t) => upcomingDay(t)! > horizon).sort((a, b) => upcomingDay(a)!.localeCompare(upcomingDay(b)!) || byOrder(a, b))
      const months = [...new Set([...later.map((t) => upcomingDay(t)!.slice(0, 7)), ...events.filter((e) => e.date > horizon).map((e) => e.date.slice(0, 7))])].sort()
      return (
        <>
          {standardHead('upcoming', <>{eventButton(addDays(today, 1))}{addButton()}</>)}
          {tagBar(all)}
          {Array.from({ length: UPCOMING_DAYS }, (_, i) => {
            const day = addDays(today, i + 1)
            const d = parseDay(day)
            const items = f.filter((t) => upcomingDay(t) === day).sort(byOrder)
            const dayEvents = events.filter((e) => e.date === day)
            return (
              <div key={day}>
                <div
                  // The + dropped on a day starts a to-do for that day.
                  onDragOver={(e) => { if (plusDragging()) e.preventDefault() }}
                  onDrop={(e) => { if (plusDragging()) { e.preventDefault(); setPlusDragging(false); insertAt({ when: day }) } }}
                  className={`flex items-baseline gap-2 mt-7 mb-1 pb-1.5 border-b border-border/80 ${items.length || dayEvents.length ? '' : 'opacity-55'}`}
                >
                  <span className="text-[22px] font-bold leading-none tracking-tight min-w-[26px]">{d.getDate()}</span>
                  <span className="text-[13px] font-semibold text-muted-foreground">{i === 0 ? 'Tomorrow' : DAYS[d.getDay()]}</span>
                </div>
                {eventRows(dayEvents)}
                {rows(items, 'upcoming', `day:${day}`)}
                <ul>{ghosts(day)}</ul>
              </div>
            )
          })}
          {months.map((mo) => {
            const [y, m] = mo.split('-').map(Number)
            return (
              <div key={mo}>
                <h2 className={SECTION}>{MONTHS_LONG[m - 1]}{y !== parseDay(today).getFullYear() ? ` ${y}` : ''}</h2>
                {eventRows(events.filter((e) => e.date > horizon && e.date.startsWith(mo)))}
                {rows(later.filter((t) => upcomingDay(t)!.startsWith(mo)), 'anytime', 'later')}
              </div>
            )
          })}
        </>
      )
    }

    if (view === 'anytime' || view === 'someday') {
      const all = todos.filter((t) => live(t) && (view === 'anytime' ? isAnytime(t, today) : isSomeday(t)))
      // Habits come round on their own days, so they have no list of their
      // own to wait in; Anytime is where one can be found between times.
      const habits = view === 'anytime' ? todos.filter((t) => t.type === 'Habit' && !t.listId && tagged(t)).sort(byOrder) : []
      return (
        <>
          {standardHead(view, addButton())}
          {tagBar(all)}
          {all.length === 0 && habits.length === 0
            ? view === 'anytime'
              ? empty('Nothing here yet.', 'To-dos that have a project or a day, and could be done now, collect here.')
              : empty('No someday ideas.', 'Park things you might do later here, so they stay out of your way — and out of your plan.')
            : byPlace(all.filter(tagged), view)}
          {habits.length > 0 && (
            <>
              <h2 className={SECTION}><Repeat className="w-[15px] h-[15px]" />Repeating</h2>
              {rows(habits, 'anytime', 'habits')}
            </>
          )}
        </>
      )
    }

    if (view === 'logbook') {
      const items = [
        ...todos.filter((t) => t.type === 'Task' && t.done).map((t) => ({ at: t.doneAt ?? '', todo: t, list: null as TodoList | null })),
        ...lists.filter((l) => l.done).map((l) => ({ at: l.doneAt ?? '', todo: null as Todo | null, list: l })),
      ].sort((a, b) => b.at.localeCompare(a.at))
      const days = new Map<string, typeof items>()
      for (const it of items) {
        const at = it.at ? new Date(it.at) : null
        const key = at && !Number.isNaN(at.getTime())
          ? `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
          : today
        days.set(key, [...(days.get(key) ?? []), it])
      }
      // Days older than a month are put away, under one line that opens them.
      const cutoff = addDays(today, -30)
      const recent = [...days].filter(([day]) => day >= cutoff)
      const older = [...days].filter(([day]) => day < cutoff)
      const dayBlock = ([day, group]: [string, typeof items]) => {
        const done = group.flatMap((g) => (g.todo ? [g.todo] : []))
        return (
          <div key={day}>
            <h2 className={SECTION}>{relDate(day, today)}</h2>
            <ul>
              {group.map((g) => (g.list ? listRow(g.list, g.list.kind === 'project' ? 'Project' : 'Area') : row(g.todo!, 'logbook', done, 'logbook')))}
            </ul>
          </div>
        )
      }
      const archived = older.reduce((n, [, group]) => n + group.length, 0)
      return (
        <>
          {standardHead('logbook')}
          {items.length === 0 && empty('Nothing completed yet.', 'Finished to-dos and projects are kept here.')}
          {recent.map(dayBlock)}
          {archived > 0 && (
            <>
              <button
                type="button"
                onClick={() => setArchiveOpen((o) => !o)}
                aria-expanded={archiveOpen}
                className="mt-6 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Archive className="w-[15px] h-[15px]" />
                Archive · {archived} from before {relDate(cutoff, today)}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
              </button>
              {archiveOpen && older.map(dayBlock)}
            </>
          )}
        </>
      )
    }

    if (tagView !== null) {
      const all = todos.filter((t) => live(t) && t.tags.includes(tagView) && t.type !== 'Prayer')
      return (
        <>
          {head(<Tag className="w-[22px] h-[22px] shrink-0 text-muted-foreground" />, tagView, undefined, 'Everything with this tag, in every list.')}
          {all.length === 0 ? empty('Nothing tagged this.', 'Tags are added inside a to-do.') : byPlace(all, 'tag')}
        </>
      )
    }

    if (!list) return ready ? empty('This list is gone.', 'It may have been deleted. Pick another from the side.', 'not-found') : null

    const more = (
      <button aria-label="List options" className={ICON_BTN} onClick={(e) => setPop({ kind: 'list', rect: e.currentTarget.getBoundingClientRect() })}>
        <Ellipsis className="w-[18px] h-[18px]" />
      </button>
    )
    const titleInput = (
      <input
        key={list.id}
        value={list.title}
        autoFocus={!list.title}
        onChange={(e) => patchList(list.id, { title: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder={list.kind === 'project' ? 'Untitled project' : 'Untitled area'}
        aria-label="Name"
        // As wide as the name, so the ··· sits straight after it.
        size={Math.max(list.title.length, 14) + 1}
        className="min-w-0 max-w-full bg-transparent outline-none placeholder:text-muted-foreground/50"
      />
    )
    const notes = (
      <AutoTextarea
        value={list.notes}
        onChange={(e) => patchList(list.id, { notes: e.target.value })}
        placeholder="Notes"
        aria-label="Notes"
        className="block w-full mt-1 mb-2 bg-transparent outline-none resize-none overflow-hidden text-[14px] text-foreground/75 leading-normal min-h-[21px] placeholder:text-muted-foreground/50"
      />
    )
    const due = list.deadline ? deadlineLabel(list.deadline, today) : null
    const facts = (area: TodoList | null) => (due || area || list.done) && (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
        {area && <button className="hover:text-foreground" onClick={() => onNavigate(`area:${area.id}`)}>{area.title || 'Untitled area'}</button>}
        {due && !list.done && (
          <span className={`inline-flex items-center gap-1 ${due.tone === 'over' ? 'text-red-500 font-semibold' : due.tone === 'soon' ? 'text-amber-500' : ''}`}>
            <Flag className="w-[13px] h-[13px]" />Due {relDate(list.deadline!, today)}
          </span>
        )}
        {list.done && <span>Completed</span>}
      </div>
    )

    if (list.kind === 'project') {
      const all = todos.filter((t) => t.listId === list.id)
      const openOnes = all.filter((t) => shown(t) && tagged(t)).sort(byOrder)
      const headingIds = new Set(list.headings.map((h) => h.id))
      const setHeadings = (headings: TodoList['headings']) => patchList(list.id, { headings })
      const addHeading = () => setHeadings([...list.headings, { id: `h${Date.now().toString(36)}`, title: '' }])
      const logged = all.filter((t) => t.done && !justDone.has(t.id)).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
      return (
        <>
          <header className="flex items-center gap-2 mb-2">
            <h1 className={TITLE}>
              <ProgressRing value={progress(list, todos)} size={22} className="text-primary" />
              {titleInput}
            </h1>
            {more}
            <span className="flex-1" />
            {!list.done && (
              <button onClick={addHeading} title="New heading" aria-label="New heading" className={ICON_BTN}>
                <Heading className="w-[17px] h-[17px]" />
              </button>
            )}
            {!list.done && addButton()}
          </header>
          {facts(lists.find((l) => l.id === list.areaId) ?? null)}
          {notes}
          {tagBar(all.filter((t) => !t.done))}
          {openOnes.length === 0 && logged.length === 0 && list.headings.length === 0 && empty('An empty project.', 'Press N to add the first step — or tell the assistant what it takes.')}
          {/* What has no heading first, then each heading with its own. */}
          {rows(openOnes.filter((t) => !t.headingId || !headingIds.has(t.headingId)), 'project', 'h:')}
          {list.headings.map((h) => (
            <div key={h.id}>
              <h2
                className={`${SECTION} group/h ${dropHeading === h.id ? 'border-primary' : ''} ${dragHeading === h.id ? 'opacity-40' : ''}`}
                // A heading with nothing under it has no row to drop on, so it takes the drop itself —
                // a to-do, the +, or another heading being moved in front of it.
                onDragOver={(e) => {
                  if (dragId() === null && !plusDragging() && (dragHeading === null || dragHeading === h.id)) return
                  e.preventDefault()
                  if (dropHeading !== h.id) setDropHeading(h.id)
                }}
                onDragLeave={() => setDropHeading((cur) => (cur === h.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropHeading(null)
                  if (dragHeading && dragHeading !== h.id) {
                    // The whole heading, its to-dos with it, goes in front of this one.
                    const moving = list.headings.find((x) => x.id === dragHeading)!
                    const rest = list.headings.filter((x) => x.id !== dragHeading)
                    rest.splice(rest.findIndex((x) => x.id === h.id), 0, moving)
                    setHeadings(rest)
                    setDragHeading(null)
                    return
                  }
                  if (plusDragging()) { setPlusDragging(false); insertAt({ headingId: h.id }); return }
                  const group = dragIds().map(byId).filter((t): t is Todo => t?.type === 'Task')
                  setDragIds([])
                  for (const t of group) patch(t.id, { headingId: h.id, listId: list.id })
                }}
              >
                <span
                  draggable
                  onDragStart={(e) => { setDragHeading(h.id); e.dataTransfer.setData('text/plain', h.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDragHeading(null); setDropHeading(null) }}
                  title="Drag to move this heading and its to-dos"
                  className="-ml-5 w-4 grid place-items-center cursor-grab text-muted-foreground/0 group-hover/h:text-muted-foreground/60 max-md:hidden"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </span>
                <input
                  value={h.title}
                  autoFocus={!h.title}
                  onChange={(e) => setHeadings(list.headings.map((x) => (x.id === h.id ? { ...x, title: e.target.value } : x)))}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  placeholder="New heading"
                  aria-label="Heading"
                  className="flex-1 min-w-0 bg-transparent outline-none font-bold placeholder:text-muted-foreground/50 placeholder:font-semibold"
                />
                <button
                  aria-label="Heading options"
                  className="grid place-items-center w-6 h-5 -my-0.5 rounded text-primary/80 hover:text-primary hover:bg-foreground/[0.06]"
                  onClick={(e) => setPop({ kind: 'heading', rect: e.currentTarget.getBoundingClientRect(), headingId: h.id })}
                >
                  <Ellipsis className="w-[18px] h-[18px]" />
                </button>
              </h2>
              {typeof h.note === 'string' && (
                <AutoTextarea
                  value={h.note}
                  autoFocus={!h.note}
                  onChange={(e) => setHeadings(list.headings.map((x) => (x.id === h.id ? { ...x, note: e.target.value } : x)))}
                  // Emptied and left, a note goes; there is nothing to keep.
                  onBlur={(e) => { if (!e.target.value.trim()) setHeadings(list.headings.map((x) => (x.id === h.id ? { id: x.id, title: x.title } : x))) }}
                  placeholder="Notes for this part"
                  aria-label={`Notes for ${h.title || 'this heading'}`}
                  className="block w-full mb-1 bg-transparent outline-none resize-none overflow-hidden text-[13.5px] text-foreground/70 leading-normal placeholder:text-muted-foreground/50"
                />
              )}
              {rows(openOnes.filter((t) => t.headingId === h.id), 'project', `h:${h.id}`)}
            </div>
          ))}
          {logged.length > 0 && (
            <>
              <button onClick={() => setShowLogged((v) => !v)} className="mt-3 ml-[15px] px-2 py-0.5 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.045]">
                {showLogged ? 'Hide' : 'Show'} {logged.length} completed
              </button>
              {showLogged && rows(logged, 'project', 'logged')}
            </>
          )}
        </>
      )
    }

    const own = todos.filter((t) => t.listId === list.id && shown(t))
    const projects = lists.filter((l) => l.kind === 'project' && l.areaId === list.id && !l.done).sort(byOrder)
    return (
      <>
        <header className="flex items-center gap-2 mb-2">
          <h1 className={TITLE}>
            <Square className="w-[22px] h-[22px] shrink-0 text-muted-foreground" />
            {titleInput}
          </h1>
          {more}
            <span className="flex-1" />
          {!list.done && addButton()}
        </header>
        {facts(null)}
        {notes}
        {tagBar(own)}
        {projects.length > 0 && (
          <ul className={own.length ? 'mb-4' : ''}>
            {projects.map((p) => listRow(p, `${todos.filter((t) => t.listId === p.id && t.type === 'Task' && !t.done).length} open`))}
          </ul>
        )}
        {rows(own.filter(tagged).sort(byOrder), 'area', 'area')}
        {projects.length === 0 && own.length === 0 && empty('An empty area.', 'Areas hold what is ongoing. Add to-dos here, or a project with New list.')}
      </>
    )
  }

  // ── Menus ────────────────────────────────────────────────────────────

  function menu(): React.ReactNode {
    if (!pop) return null
    const close = () => { setPop(null); setJump(''); setQuickFilter('') }
    const t = byId(pop.todoId)

    if (pop.kind === 'event' && pop.event) {
      return (
        <Pop rect={pop.rect} onClose={close}>
          <EventEditor event={pop.event} onDone={(changed) => { close(); if (changed) { notifyDataChanged(); reload() } }} />
        </Pop>
      )
    }
    if (pop.kind === 'heading' && list) {
      const id = pop.headingId!
      const heading = list.headings.find((h) => h.id === id)
      const others = lists.filter((l) => l.kind === 'project' && !l.done && l.id !== list.id).sort(byOrder)
      return (
        <Pop rect={pop.rect} onClose={close}>
          <button className={MENU} onClick={() => { close(); newTodo(id) }}><Plus className="w-[18px] h-[18px]" />New to-do here</button>
          {typeof heading?.note !== 'string' && (
            <button className={MENU} onClick={() => { close(); patchList(list.id, { headings: list.headings.map((h) => (h.id === id ? { ...h, note: '' } : h)) }) }}>
              <FileText className="w-[18px] h-[18px]" />Add a note
            </button>
          )}
          {/* Archive: everything under it is done, so it goes to the Logbook and the heading goes with it. */}
          <button
            className={MENU}
            onClick={() => {
              close()
              for (const t of todos) if (t.listId === list.id && t.headingId === id && !t.done) toggle(t)
              patchList(list.id, { headings: list.headings.filter((h) => h.id !== id) })
            }}
          >
            <Check className="w-[18px] h-[18px]" />Complete heading
          </button>
          <hr className="my-1.5 mx-1 border-border/70" />
          {/* Only the heading goes: what was under it moves up to the top of the project. */}
          <button
            className={`${MENU} text-red-500`}
            onClick={() => {
              close()
              for (const t of todos) if (t.listId === list.id && t.headingId === id) patch(t.id, { headingId: null })
              patchList(list.id, { headings: list.headings.filter((h) => h.id !== id) })
            }}
          >
            <Trash2 className="w-[18px] h-[18px]" />Delete heading
          </button>
          {/* The whole heading — its note and its to-dos — to another project. */}
          {others.length > 0 && (
            <>
              <hr className="my-1.5 mx-1 border-border/70" />
              <PopHead>Move heading to</PopHead>
              {others.map((p) => (
                <button
                  key={p.id}
                  className={MENU}
                  onClick={() => {
                    close()
                    if (!heading) return
                    patchList(p.id, { headings: [...p.headings, heading] })
                    for (const t of todos) if (t.listId === list.id && t.headingId === id) patch(t.id, { listId: p.id, headingId: id })
                    patchList(list.id, { headings: list.headings.filter((h) => h.id !== id) })
                  }}
                >
                  <ProgressRing value={progress(p, todos)} size={18} className="text-primary" />
                  <span className="truncate">{p.title || 'Untitled project'}</span>
                </button>
              ))}
            </>
          )}
        </Pop>
      )
    }
    if (pop.kind === 'list' && list) {
      const set = (changes: Partial<TodoList>) => { close(); patchList(list.id, changes) }
      const areas = lists.filter((l) => l.kind === 'area' && !l.done).sort(byOrder)
      return (
        <Pop rect={pop.rect} onClose={close}>
          <DateRow Icon={Flag} label="Deadline" value={list.deadline} onPick={(d) => set({ deadline: d })} />
          {list.deadline && <button className={MENU} onClick={() => set({ deadline: null })}><X className="w-[18px] h-[18px]" />Remove deadline</button>}
          {list.kind === 'project' && (
            <>
              <hr className="my-1.5 mx-1 border-border/70" />
              <PopHead>Area</PopHead>
              <button className={`${MENU} ${list.areaId ? '' : 'text-primary font-semibold'}`} onClick={() => set({ areaId: null })}>
                <Layers className="w-[18px] h-[18px]" />No area
              </button>
              {areas.map((a) => (
                <button key={a.id} className={`${MENU} ${list.areaId === a.id ? 'text-primary font-semibold' : ''}`} onClick={() => set({ areaId: a.id })}>
                  <Square className="w-[18px] h-[18px]" />{a.title || 'Untitled area'}
                </button>
              ))}
            </>
          )}
          <hr className="my-1.5 mx-1 border-border/70" />
          <button className={MENU} onClick={() => set({ done: !list.done })}>
            <Check className="w-[18px] h-[18px]" />{list.done ? 'Reopen' : list.kind === 'project' ? 'Complete project' : 'Complete area'}
          </button>
          <button className={`${MENU} text-red-500`} onClick={() => { close(); removeList(list); onNavigate('anytime') }}>
            <Trash2 className="w-[18px] h-[18px]" />Delete {list.kind}
          </button>
        </Pop>
      )
    }
    if (!t) return null
    const all = pop.batch ? targets(t) : [t]
    const set = (changes: Partial<Todo>) => { close(); setPicked(new Set()); for (const x of all) patch(x.id, changes) }

    if (pop.kind === 'when') {
      return (
        <Pop rect={pop.rect} onClose={close}>
          <PopHead>When{all.length > 1 ? ` · ${all.length} to-dos` : ''}</PopHead>
          {/* Jump Start: type it the way you would say it. */}
          {(() => {
            const guess = parseWhen(jump, today)
            const apply = () => {
              if (!guess) return
              if (guess.reminder) askForNotifications()
              set(guess.someday ? { someday: true } : { when: guess.when ?? today, evening: guess.evening, ...(guess.reminder ? { time: guess.reminder, reminder: guess.reminder } : {}) })
              setJump('')
            }
            return (
              <div className="px-1 pb-1">
                <input
                  autoFocus
                  value={jump}
                  onChange={(e) => setJump(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } }}
                  placeholder="tom, sat, in 4 days, fri 8pm…"
                  title="A time typed here (8pm, 14:30) becomes the to-do's time"
                  aria-label="Type a day"
                  className="w-full rounded-md bg-foreground/[0.05] px-2 py-1 text-[13.5px] outline-none focus:ring-1 focus:ring-primary"
                />
                {jump.trim() && (
                  <button onClick={apply} disabled={!guess} className={`${MENU} mt-1 ${guess ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                    <CalendarDays className="w-[18px] h-[18px]" />{guess ? guess.label : 'Not a day I know'}
                  </button>
                )}
              </div>
            )
          })()}
          <button className={MENU} onClick={() => set({ when: today, evening: false })}><Star className="w-[18px] h-[18px] text-amber-400 fill-amber-400" />Today</button>
          <button className={MENU} onClick={() => set({ when: today, evening: true })}><Moon className={`w-[18px] h-[18px] ${EVENING_TONE}`} />This evening</button>
          <button className={MENU} onClick={() => set({ when: addDays(today, 1), evening: false })}><CalendarDays className="w-[18px] h-[18px]" />Tomorrow</button>
          <DateRow Icon={CalendarDays} label="Date" value={t.when} onPick={(d) => set({ when: d, evening: false })} />
          <button className={MENU} onClick={() => set({ someday: true })}><Archive className={`w-[18px] h-[18px] ${SOMEDAY_TONE}`} />Someday</button>
          {(t.when || t.someday) && (
            <>
              <hr className="my-1.5 mx-1 border-border/70" />
              <button className={MENU} onClick={() => set({ when: null, evening: false, someday: false, time: null, reminder: null })}><X className="w-[18px] h-[18px]" />Clear</button>
            </>
          )}
        </Pop>
      )
    }
    if (pop.kind === 'time') {
      const lengths = [15, 30, 45, 60, 90, 120]
      const chip = (on: boolean) => `rounded-md px-2 py-1 text-[12.5px] font-medium tabular-nums ${on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.05] hover:bg-foreground/[0.09]'}`
      const remind = t.reminder !== null && t.reminder === t.time
      // Picking a time reminds you then, as in Things; untick to keep it quiet.
      const at = (time: string) => {
        askForNotifications()
        patch(t.id, { time, reminder: t.time && !remind ? t.reminder : time })
      }
      return (
        <Pop rect={pop.rect} onClose={close}>
          <PopHead>Time{t.when ? ` · ${relDate(t.when, today)}` : ' · Today'}</PopHead>
          <div className="grid grid-cols-4 gap-1 px-1.5 pb-1.5">
            {[['Morning', '09:00'], ['Noon', '12:00'], ['Afternoon', '15:00'], ['Evening', '19:00']].map(([label, time]) => (
              <button key={time} onClick={() => at(time)} className={`${chip(t.time === time)} flex flex-col items-center leading-tight py-1.5`}>
                <span>{time}</span>
                <span className={`text-[10.5px] font-normal ${t.time === time ? '' : 'text-muted-foreground'}`}>{label}</span>
              </button>
            ))}
          </div>
          <label className={`${MENU} cursor-pointer`}>
            <Clock className="w-[18px] h-[18px]" />
            <span className="flex-1">Exactly</span>
            <input
              type="time"
              autoFocus
              defaultValue={t.time ?? ''}
              aria-label="Time"
              onChange={(e) => { if (e.target.value) at(e.target.value) }}
              className="text-[13px] rounded-md border border-border/70 bg-background px-1 py-0.5 tabular-nums"
            />
          </label>
          <PopHead>Takes</PopHead>
          <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
            {lengths.map((m) => (
              <button key={m} onClick={() => patch(t.id, { minutes: m })} className={chip(t.minutes === m)}>{m < 60 ? `${m}m` : `${m / 60}h`}</button>
            ))}
          </div>
          {t.time && (
            <>
              <label className={`${MENU} cursor-pointer`}>
                <input type="checkbox" checked={remind} onChange={(e) => patch(t.id, { reminder: e.target.checked ? t.time : null })} className="accent-[var(--primary)]" />
                <span className="flex-1">Remind me at {t.time}</span>
              </label>
              <hr className="my-1.5 mx-1 border-border/70" />
              <button className={MENU} onClick={() => set({ time: null, ...(remind ? { reminder: null } : {}) })}><X className="w-[18px] h-[18px]" />No time</button>
            </>
          )}
        </Pop>
      )
    }
    if (pop.kind === 'deadline') {
      return (
        <Pop rect={pop.rect} onClose={close}>
          <PopHead>Deadline</PopHead>
          <DateRow Icon={Flag} label="Due" value={t.deadline} onPick={(d) => set({ deadline: d })} />
          <button className={MENU} onClick={() => set({ deadline: addDays(today, 7) })}><CalendarDays className="w-[18px] h-[18px]" />In a week</button>
          {t.deadline && (
            <>
              <hr className="my-1.5 mx-1 border-border/70" />
              <button className={MENU} onClick={() => set({ deadline: null })}><X className="w-[18px] h-[18px]" />Remove deadline</button>
            </>
          )}
        </Pop>
      )
    }
    if (pop.kind === 'remind') {
      // One reminder at a time: choosing one clears the others.
      const choose = (r: Partial<Todo>) => {
        askForNotifications()
        set({ reminder: null, remindBefore: null, remindAt: null, snoozedUntil: null, ...r })
      }
      const on = (r: Partial<Todo>) => Object.entries(r).every(([k, v]) => t[k as keyof Todo] === v)
      const item = (label: string, r: Partial<Todo>, Icon: React.ComponentType<{ className?: string }> = Bell) => (
        <button key={label} className={`${MENU} ${on(r) ? 'text-primary font-semibold' : ''}`} onClick={() => choose(r)}>
          <Icon className="w-[18px] h-[18px]" />{label}
        </button>
      )
      const day = t.when ?? today
      const [nowDate, nowTime] = [today, `${String(wallNow().getHours()).padStart(2, '0')}:${String(wallNow().getMinutes()).padStart(2, '0')}`]
      return (
        <Pop rect={pop.rect} onClose={close}>
          <PopHead>Remind me{t.time ? ` · it’s at ${t.time}` : ''}</PopHead>
          {t.time ? (
            <>
              {item(`At ${t.time}`, { reminder: t.time })}
              {[10, 30, 60, 1440].map((m) => item(`${leadTime(m)} before`, { remindBefore: m }, Clock))}
            </>
          ) : (
            <p className="px-2.5 pb-1.5 text-[12.5px] text-muted-foreground">Give it a time to be reminded before it.</p>
          )}
          <label className={`${MENU} cursor-pointer`}>
            <Clock className="w-[18px] h-[18px]" />
            <span className="flex-1">{t.type === 'Habit' ? 'Each day at' : t.when ? `${relDate(day, today)} at` : 'Today at'}</span>
            <input
              type="time"
              defaultValue={t.reminder ?? ''}
              aria-label="Remind at a time"
              onChange={(e) => { if (e.target.value) choose({ reminder: e.target.value, ...(t.type === 'Task' && !t.when ? { when: today } : {}) }) }}
              className="text-[13px] rounded-md border border-border/70 bg-background px-1 py-0.5 tabular-nums"
            />
          </label>
          {t.type === 'Task' && (
            <label className={`${MENU} cursor-pointer`}>
              <CalendarDays className="w-[18px] h-[18px]" />
              <span className="flex-1">On</span>
              <input
                type="datetime-local"
                defaultValue={t.remindAt ?? ''}
                min={`${nowDate}T${nowTime}`}
                aria-label="Remind on a day and time"
                onChange={(e) => { if (e.target.value) choose({ remindAt: e.target.value.slice(0, 16) }) }}
                className="text-[12.5px] rounded-md border border-border/70 bg-background px-1 py-0.5 tabular-nums"
              />
            </label>
          )}
          {(t.reminder || t.remindBefore || t.remindAt || t.snoozedUntil) && (
            <>
              <hr className="my-1.5 mx-1 border-border/70" />
              <button className={MENU} onClick={() => choose({})}><X className="w-[18px] h-[18px]" />No reminder</button>
            </>
          )}
        </Pop>
      )
    }
    if (pop.kind === 'repeat') {
      const option = (value: string | null, label: string) => (
        <button key={label} className={`${MENU} ${t.repeats === value ? 'text-primary font-semibold' : ''}`} onClick={() => set({ repeats: value })}>
          <Repeat className={`w-[18px] h-[18px] ${value ? '' : 'opacity-30'}`} />{label}
        </button>
      )
      const weekday = DAYS[parseDay(t.when ?? today).getDay()]
      return (
        <Pop rect={pop.rect} onClose={close}>
          <PopHead>Repeat</PopHead>
          {t.type === 'Task' && option(null, 'Does not repeat')}
          {option('daily', 'Every day')}
          {option('weekdays', 'Weekdays')}
          {option('weekly', `Every ${weekday}`)}
        </Pop>
      )
    }
    const areas = lists.filter((l) => l.kind === 'area' && !l.done).sort(byOrder)
    const areaIds = new Set(areas.map((a) => a.id))
    const projects = lists.filter((l) => l.kind === 'project' && !l.done).sort(byOrder)
    // Quick Move: type to narrow the lists down; Enter takes the first.
    const q = quickFilter.trim().toLowerCase()
    const fits = (label: string) => !q || label.toLowerCase().includes(q)
    const firstFit = [...projects, ...areas].find((l) => fits(l.title || ''))
    const item = (id: number | null, label: string, icon: React.ReactNode, indent = false) => !fits(label) ? null : (
      <button key={id ?? 'none'} className={`${MENU} ${indent ? 'pl-[30px]' : ''} ${t.listId === id ? 'text-primary font-semibold' : ''}`} onClick={() => set({ listId: id })}>
        {icon}<span className="truncate">{label}</span>
      </button>
    )
    const ring = (p: TodoList) => <ProgressRing value={progress(p, todos)} size={18} className="text-primary" />
    return (
      <Pop rect={pop.rect} onClose={close}>
        <PopHead>Move {all.length > 1 ? `${all.length} to-dos ` : ''}to</PopHead>
        <div className="px-1 pb-1">
          <input
            autoFocus
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && firstFit) { e.preventDefault(); setQuickFilter(''); set({ listId: firstFit.id }) } }}
            placeholder="Type to find a list"
            aria-label="Find a list"
            className="w-full rounded-md bg-foreground/[0.05] px-2 py-1 text-[13.5px] outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {item(null, t.type === 'Task' ? 'Inbox' : 'No list', <Inbox className="w-[18px] h-[18px]" />)}
        {projects.filter((p) => !p.areaId || !areaIds.has(p.areaId)).map((p) => item(p.id, p.title || 'Untitled project', ring(p)))}
        {areas.map((a) => [
          item(a.id, a.title || 'Untitled area', <Square className="w-[18px] h-[18px]" />),
          ...projects.filter((p) => p.areaId === a.id).map((p) => item(p.id, p.title || 'Untitled project', ring(p), true)),
        ])}
      </Pop>
    )
  }

  /** The one column the rows and the assistant's bar both sit in. */
  const column = `w-full mx-auto ${stretched ? 'max-w-none' : 'max-w-[740px]'} px-12 max-md:px-[18px]`
  const known = (STANDARD_VIEWS as readonly string[]).includes(view) || listId !== null || tagView !== null

  return (
    <div ref={scroller} className="h-full overflow-y-auto flex flex-col">
      <div className={`${column} flex-1 pt-10 max-md:pt-2 pb-16 text-[14px] max-md:text-[15px] transition-opacity duration-150 ${ready || down ? 'opacity-100' : 'opacity-0'}`}>
        {phoneBar}
        {!ready && down ? (
          // The server is not answering: say so, kindly, with a way to try again.
          <div className="mt-20 flex flex-col items-center text-center" role="status">
            <Tuck state="maintenance" size={190} decorative />
            <p className="mt-2 text-[16px] font-semibold">Fixing something. Back soon.</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Your lists are safe. This is on our side.</p>
            <button onClick={reload} className="mt-4 rounded-md border border-border/80 px-3 py-1.5 text-[13px] font-medium hover:bg-foreground/[0.05]">Try again</button>
          </div>
        ) : (
          <>
            {banner}
            {known ? body() : null}
          </>
        )}
      </div>
      {/*
        Inside the scroller and in the same column as the rows, not laid over
        the page: an overlay is centred on the whole pane, the list on the
        pane minus its scrollbar, and the two sat a few pixels apart. The bar
        takes the open to-do card's edges, so it reads as part of the list.
      */}
      {dock && (
        <div className="group sticky bottom-0 z-10 pointer-events-none">
          {/* A phone adds with its thumb: the round button, bottom right —
              stepping aside while the assistant's island is up. */}
          {!list?.done && view !== 'logbook' && (
            <div className={`${column} md:hidden flex justify-end pb-[calc(env(safe-area-inset-bottom)+12px)]`}>
              <button onClick={() => newTodo()} aria-label="New to-do" className="pointer-events-auto grid place-items-center w-[52px] h-[52px] rounded-full bg-primary text-primary-foreground shadow-[0_2px_10px_rgb(0_0_0/0.25)] active:scale-95 transition-[opacity,scale] duration-200 group-has-[[data-island]]:opacity-0 group-has-[[data-island]]:scale-75 group-has-[[data-island]]:pointer-events-none">
                <Plus className="w-7 h-7" strokeWidth={2.2} />
              </button>
            </div>
          )}
          {/*
            The assistant: an island at the foot of the list, centred on its
            column, there only while in use (Quick Capture, in the sidebar).
            It rises over the list, and over the round button on a phone.
          */}
          <div className={`${column} absolute inset-x-0 bottom-0 z-10 pb-6 max-md:pb-[calc(env(safe-area-inset-bottom)+12px)]`}>{dock}</div>
        </div>
      )}
      {picked.size > 1 && (
        <div data-pop className="fixed z-40 bottom-24 max-md:bottom-28 left-1/2 md:left-[calc(50%+120px)] -translate-x-1/2 flex items-center gap-1 rounded-xl border border-border/70 bg-popover px-2 py-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_28px_rgb(0_0_0/0.16)] text-[13px]">
          <span className="px-1.5 font-semibold tabular-nums">{picked.size} selected</span>
          {(() => {
            const first = byId([...picked][0])
            const btn = 'inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-foreground/[0.06]'
            if (!first) return null
            return (
              <>
                <button className={btn} onClick={(e) => setPop({ kind: 'when', rect: e.currentTarget.getBoundingClientRect(), todoId: first.id, batch: true })}><CalendarDays className="w-4 h-4" />When</button>
                <button className={btn} onClick={(e) => setPop({ kind: 'move', rect: e.currentTarget.getBoundingClientRect(), todoId: first.id, batch: true })}><Inbox className="w-4 h-4" />Move</button>
                <button className={btn} onClick={() => { for (const t of targets(first)) complete(t); setPicked(new Set()) }}><Check className="w-4 h-4" />Complete</button>
                <button className={`${btn} text-red-500`} onClick={() => { for (const t of targets(first)) destroy(t); setPicked(new Set()) }}><Trash2 className="w-4 h-4" />Delete</button>
                <button className={btn} aria-label="Clear selection" onClick={() => setPicked(new Set())}><X className="w-4 h-4" /></button>
              </>
            )
          })()}
        </div>
      )}
      {menu()}
    </div>
  )
}
