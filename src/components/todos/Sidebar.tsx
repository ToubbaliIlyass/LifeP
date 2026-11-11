'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Inbox as ProposalsIcon, Keyboard, Layers, Mic, Moon, Pencil, Plus, Search, SlidersHorizontal, Square, Sun, Trash2 } from 'lucide-react'
import { useMode } from '@/lib/useMode'
import { addDays } from '@/lib/date'
import { byOrder, counts, progress, type StandardView } from '@/lib/todo-views'
import type { Todo, TodoList } from '@/lib/todos'
import { useTodos } from './TodosProvider'
import { ProgressRing, VIEW_META } from './parts'
import { AttachButton } from '@/components/chat/attachments'
import { ASSISTANT_TRIGGER } from '@/components/today/TodayAssistant'
import { BTN_PRIMARY } from '@/components/ui/buttons'

const SB_MIN = 220
const SB_MAX = 480
const SB_DEFAULT = 284

/** Sets the sidebar's width for the whole page (the lists and the cards beside it read it) and remembers it on this device. */
function setSidebarWidth(px: number, save: boolean) {
  const w = Math.round(Math.min(SB_MAX, Math.max(SB_MIN, px)))
  document.documentElement.style.setProperty('--sb', `${w}px`)
  if (save) { try { localStorage.setItem('acture-sb', String(w)) } catch { /* not remembered */ } }
  return w
}

/** The edge you drag to make the sidebar wider or narrower; double-click puts it back, arrow keys nudge it. */
function ResizeHandle() {
  const [dragging, setDragging] = useState(false)
  const current = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sb'), 10) || SB_DEFAULT
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuemin={SB_MIN}
      aria-valuemax={SB_MAX}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault()
        const startX = e.clientX
        const startW = current()
        setDragging(true)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        const move = (ev: PointerEvent) => setSidebarWidth(startW + ev.clientX - startX, false)
        const up = (ev: PointerEvent) => {
          setSidebarWidth(startW + ev.clientX - startX, true)
          setDragging(false)
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      onDoubleClick={() => setSidebarWidth(SB_DEFAULT, true)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setSidebarWidth(current() - 16, true) }
        if (e.key === 'ArrowRight') { e.preventDefault(); setSidebarWidth(current() + 16, true) }
      }}
      className="group absolute inset-y-0 -right-1.5 z-30 w-3 cursor-col-resize touch-none max-md:hidden focus-visible:outline-none"
    >
      <span className={`absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary/60 ${dragging ? 'bg-primary/60' : 'bg-transparent'}`} />
    </div>
  )
}

/** What dropping a to-do on a list means, in fields. */
function dropChanges(todo: Todo, target: string, today: string): Partial<Todo> | 'complete' | null {
  if (target.startsWith('project:') || target.startsWith('area:')) {
    return { listId: Number(target.split(':')[1]) }
  }
  // The day a prayer is due is worked out, not set.
  if (todo.prayerKey) return null
  switch (target) {
    case 'inbox': return { listId: null, when: null, evening: false, someday: false }
    case 'today': return { when: today, evening: false, someday: false }
    case 'upcoming': return !todo.when || todo.when <= today ? { when: addDays(today, 1), evening: false, someday: false } : {}
    case 'anytime': return { someday: false, ...(todo.when && todo.when > today ? { when: null } : {}) }
    case 'someday': return { someday: true }
    case 'logbook': return 'complete'
    default: return null
  }
}

/* Things' sidebar: small type, tight rows, an icon column that every label lines up behind. */
const TOOL = 'grid place-items-center w-7 h-7 max-md:w-11 max-md:h-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]'
const ROW = 'flex items-center gap-2 max-md:gap-3 w-full px-2 py-[3.5px] max-md:min-h-11 max-md:py-2 rounded-md text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] leading-5 text-left select-none'

const MENU_ITEM = 'flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left text-[length:calc(14px*var(--ts))] hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] outline-none max-md:py-3 max-md:text-[length:calc(16px*var(--ts))]'

/** A menu at the pointer, kept on the screen, closed by a click elsewhere, Escape or scrolling. */
function ContextMenu({ at, onClose, children }: { at: { x: number; y: number }; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setPos({
      left: Math.max(8, Math.min(at.x, window.innerWidth - el.offsetWidth - 8)),
      top: Math.max(8, Math.min(at.y, window.innerHeight - el.offsetHeight - 8)),
    })
  }, [at])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', onClose) }
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-[70]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={ref}
        role="menu"
        style={{ left: pos?.left ?? at.x, top: pos?.top ?? at.y, visibility: pos ? 'visible' : 'hidden' }}
        className="fixed z-[71] w-[230px] rounded-xl border border-border/70 bg-popover p-1.5 shadow-xl max-md:w-[min(280px,calc(100vw-1.5rem))]"
      >
        {children}
      </div>
    </>
  )
}

/**
 * The lists, down the side.
 *
 * On a phone this is a whole screen — the one a list's back arrow returns
 * to — rather than a column beside the list.
 *
 * Fixed ones first — where a to-do stands in time — then the user's own
 * areas and projects. Every list is also somewhere to drop a to-do.
 */
export function Sidebar({
  view, onSelect, pendingCount, open, slim, onQuickFind, onCapture, onAttach,
}: {
  view: string
  onSelect: (view: string) => void
  /** Proposals from the assistant waiting for a yes or no. */
  pendingCount: number
  /** The drawer, on a phone. */
  open: boolean
  /** Slim Mode: the sidebar put away on a wide screen. */
  slim: boolean
  onQuickFind: () => void
  /** Opens the assistant over the list: listening, or with the keyboard. */
  onCapture: (how: 'listen' | 'type') => void
  /** Opens the assistant with these attached. */
  onAttach: (files: FileList) => void
}) {
  const { todos, lists, date, patch, toggle, dragId, dragIds, setDragIds, plusDragging, setPlusDragging, startDraft, createList, patchList, removeList } = useTodos()
  const [over, setOver] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** Right-clicked: which list, and where the pointer was. */
  const [menu, setMenu] = useState<{ list: TodoList; x: number; y: number } | null>(null)
  /** Being renamed in place. */
  const [renaming, setRenaming] = useState<number | null>(null)
  // Shared with Settings' own picker, so the two always agree — see src/lib/useMode.ts.
  const { dark, toggle: toggleMode } = useMode()

  const c = useMemo(() => counts(todos, lists, date), [todos, lists, date])
  const projects = lists.filter((l) => l.kind === 'project' && !l.done).sort(byOrder)
  const areas = lists.filter((l) => l.kind === 'area' && !l.done).sort(byOrder)
  const areaIds = new Set(areas.map((a) => a.id))

  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      // The + can only be dropped on the Inbox: anywhere else in the sidebar it has no meaning.
      if (dragId() === null && !(plusDragging() && target === 'inbox')) return
      e.preventDefault()
      if (over !== target) setOver(target)
    },
    onDragLeave: () => setOver((o) => (o === target ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(null)
      if (plusDragging()) {
        // Magic Plus, dropped on the Inbox: a new to-do there, from whichever list you are in.
        setPlusDragging(false)
        startDraft({ order: todos.reduce((m, t) => Math.min(m, t.order), 0) - 1 })
        onSelect('inbox')
        return
      }
      const group = dragIds().map((id) => todos.find((t) => t.id === id)).filter((t): t is Todo => !!t)
      setDragIds([])
      for (const todo of group) {
        const changes = dropChanges(todo, target, date)
        if (changes === 'complete') { if (!todo.done) toggle(todo) }
        else if (changes && Object.keys(changes).length) patch(todo.id, changes)
      }
    },
  })

  /** A plain click switches list here; ⌘- or middle-click opens it in a new tab, like any link. */
  const follow = (target: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    onSelect(target)
  }

  const rowClass = (target: string, extra = '') =>
    `${ROW} ${extra} ${
      over === target ? 'bg-primary/10 ring-[1.5px] ring-inset ring-primary'
        : view === target ? 'bg-foreground/[0.09]'
        : 'hover:bg-foreground/[0.04]'
    }`

  const standard = (id: StandardView, count?: number, due?: number) => {
    const { title, Icon, tone } = VIEW_META[id]
    return (
      <a key={id} href={`#${id}`} onClick={follow(id)} aria-current={view === id ? 'page' : undefined} className={rowClass(id, 'font-medium')} {...dropProps(id)}>
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} />
        <span className="flex-1 truncate">{title}</span>
        {/* What is due, in red, beside everything that is for today. */}
        {!!due && <span className="text-[length:calc(11px*var(--ts))] font-semibold tabular-nums text-white bg-red-500 rounded-full px-[5px] leading-4 min-w-4 text-center">{due}</span>}
        {!!count && <span className="text-[length:calc(12px*var(--ts))] tabular-nums text-muted-foreground">{count}</span>}
      </a>
    )
  }

  const openMenu = (list: TodoList) => (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ list, x: e.clientX, y: e.clientY })
  }
  /** Every way in to a list's menu: right-click, the menu key (or Shift+F10), and a long press on a touch screen. */
  const pressTimer = useRef<number | null>(null)
  const pressed = useRef(false)
  const menuProps = (list: TodoList) => ({
    onContextMenu: openMenu(list),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        setMenu({ list, x: r.left + 24, y: r.bottom })
      }
    },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      pressed.current = false
      pressTimer.current = window.setTimeout(() => { pressed.current = true; setMenu({ list, x: t.clientX, y: t.clientY }) }, 550)
    },
    onTouchMove: () => { if (pressTimer.current) window.clearTimeout(pressTimer.current) },
    onTouchEnd: (e: React.TouchEvent) => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current)
      // The finger that opened the menu must not also follow the link.
      if (pressed.current) { e.preventDefault(); pressed.current = false }
    },
  })

  /** The list's name, or a box to rename it in, when asked from the menu. */
  const nameOf = (l: TodoList, fallback: string) =>
    renaming === l.id ? (
      <input
        autoFocus
        defaultValue={l.title}
        aria-label={`Rename ${l.title || fallback}`}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.preventDefault()}
        onBlur={(e) => { patchList(l.id, { title: e.currentTarget.value.trim() }); setRenaming(null) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { e.currentTarget.value = l.title; e.currentTarget.blur() }
        }}
        className="min-w-0 flex-1 rounded bg-background px-1 outline-none ring-1 ring-primary"
      />
    ) : (
      <span className="flex-1 truncate max-md:overflow-visible max-md:whitespace-normal max-md:[overflow-wrap:anywhere]">{l.title || fallback}</span>
    )

  const project = (p: (typeof projects)[number], indent = false) => {
    const target = `project:${p.id}`
    const left = todos.filter((t) => t.listId === p.id && t.type === 'Task' && !t.done).length
    return (
      <a key={p.id} href={`#${target}`} onClick={follow(target)} {...menuProps(p)} aria-current={view === target ? 'page' : undefined} className={rowClass(target, indent ? 'max-md:pl-5 md:pl-4' : '')} {...dropProps(target)}>
        <ProgressRing value={progress(p, todos)} size={14} className="text-muted-foreground mx-px" />
        {nameOf(p, 'Untitled project')}
        {p.hideFromToday && <EyeOff aria-label="Hidden from Today" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />}
        {left > 0 && <span className="text-[length:calc(12px*var(--ts))] tabular-nums text-muted-foreground">{left}</span>}
      </a>
    )
  }

  async function addList(kind: 'project' | 'area') {
    setAdding(false)
    const inArea = view.startsWith('area:') ? Number(view.slice(5)) : null
    const id = await createList(kind, kind === 'project' ? inArea : null)
    if (id) onSelect(`${kind}:${id}`)
  }

  return (
    <>
      <aside
        aria-label="Lists"
        className={`
          relative flex flex-col min-h-0 w-[var(--sb)] shrink-0 bg-sidebar border-r border-border/60
          max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:border-r-0
          max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]
          max-md:transition-transform max-md:duration-200 motion-reduce:transition-none
          ${open ? '' : 'max-md:-translate-x-[102%]'} ${slim ? 'md:hidden' : ''}
        `}
      >
        <ResizeHandle />
        <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 pt-3 pb-3">
          {standard('inbox', c.inbox)}
          <div className="h-3" />
          {standard('today', c.today, c.due)}
          {standard('upcoming')}
          {standard('anytime')}
          {standard('someday')}
          <div className="h-3" />
          {standard('logbook')}
          <div className="h-3" />

          {projects.filter((p) => !p.areaId || !areaIds.has(p.areaId)).map((p) => project(p))}
          {areas.map((a) => {
            const target = `area:${a.id}`
            return (
              <div key={a.id}>
                <a href={`#${target}`} onClick={follow(target)} {...menuProps(a)} aria-current={view === target ? 'page' : undefined} className={rowClass(target, 'font-bold mt-3')} {...dropProps(target)}>
                  <Square className="w-4 h-4 shrink-0 text-muted-foreground" />
                  {nameOf(a, 'Untitled area')}
                  {a.hideFromToday && <EyeOff aria-label="Hidden from Today" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />}
                </a>
                {projects.filter((p) => p.areaId === a.id).map((p) => project(p, true))}
              </div>
            )
          })}
        </nav>

        {/* The way in to the assistant, on every screen: say it (the big
            one, in the theme's colour, so it is the first thing found), type
            it, or hand it a document. It opens over the foot of the list. The
            keyboard and paperclip are the same size and gap as the sun and
            settings below, so the two rows' icons stand in columns. */}
        <div className="mb-2 shrink-0 flex h-[45px] items-center gap-0.5 px-2.5" {...{ [ASSISTANT_TRIGGER]: '' }}>
          <button
            onClick={() => onCapture('listen')}
            className={`${BTN_PRIMARY} flex-1 min-w-0 mr-1.5`}
          >
            <Mic className="w-4 h-4 max-md:w-[18px] max-md:h-[18px] shrink-0" /> Tell Tuck
          </button>
          <button
            onClick={() => onCapture('type')}
            title="Type it instead"
            aria-label="Type it instead"
            className="grid place-items-center shrink-0 w-7 h-7 max-md:w-11 max-md:h-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
          >
            <Keyboard className="w-4 h-4" />
          </button>
          <AttachButton
            bare
            onFiles={onAttach}
            className="w-7 h-7 max-md:w-11 max-md:h-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
          />
        </div>

        {/* One line at the foot, as in Things: add a list on the left, the
            app's own controls as quiet icons on the right. */}
        {/* Exactly as tall as the list's bottom toolbar (TodoView), so the two lines meet across the window. */}
        <div className="relative flex items-center gap-0.5 px-2.5 h-[45px] shrink-0 border-t border-border/70">
          {adding && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAdding(false)} />
              <div className="absolute z-50 bottom-full left-2.5 mb-[62px] w-[190px] p-1.5 rounded-lg border border-border/70 bg-popover shadow-xl">
                <button onClick={() => addList('project')} className={`${ROW} hover:bg-foreground/[0.05]`}>
                  <ProgressRing value={0} size={14} className="text-muted-foreground mx-px" /> New project
                </button>
                <button onClick={() => addList('area')} className={`${ROW} hover:bg-foreground/[0.05]`}>
                  <Square className="w-4 h-4 text-muted-foreground" /> New area
                </button>
              </div>
            </>
          )}
          {/* As in Things: New List on the left, Settings on the right — with
              only light/dark beside it. Width and Slim Mode live in Settings
              (and on ⌘/), not as a row of icons to decode. */}
          <button onClick={() => setAdding((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap px-2 py-1 max-md:min-h-11 -ml-0.5 rounded-md text-[length:calc(13px*var(--ts))] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]">
            <Plus className="w-4 h-4 shrink-0" /> New List
          </button>
          {/* A phone has no keyboard to start typing on, so Quick Find gets a button there. */}
          <button onClick={onQuickFind} title="Quick Find" aria-label="Quick Find" className={`${TOOL} md:hidden`}>
            <Search className="w-4 h-4" />
          </button>
          {pendingCount > 0 && (
            <button onClick={() => onSelect('proposals')} title="Waiting for your yes or no" className={`${TOOL} relative ${view === 'proposals' ? 'text-foreground' : ''}`} aria-label={`${pendingCount} to review`}>
              <ProposalsIcon className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 text-[length:calc(9px*var(--ts))] font-bold bg-primary text-primary-foreground rounded-full min-w-3.5 px-[3px] leading-[14px] text-center">{pendingCount}</span>
            </button>
          )}
          {/* Light or dark, one press. Shows the mode you are in; the tooltip says what pressing does. */}
          <button onClick={toggleMode} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className={TOOL}>
            {dark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button onClick={() => onSelect('settings')} title="Settings" aria-label="Settings" className={`${TOOL} ${view === 'settings' ? 'text-foreground bg-foreground/[0.08]' : ''}`}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </aside>
      {menu && (() => {
        const l = menu.list
        const close = () => setMenu(null)
        const target = `${l.kind}:${l.id}`
        return (
          <ContextMenu at={menu} onClose={close}>
            <button role="menuitem" className={MENU_ITEM} onClick={() => { close(); setRenaming(l.id) }}>
              <Pencil className="h-[18px] w-[18px]" />Rename
            </button>
            {l.kind === 'area' && (
              <button role="menuitem" className={MENU_ITEM} onClick={async () => {
                close()
                const id = await createList('project', l.id)
                if (id) { onSelect(`project:${id}`); setRenaming(id) }
              }}>
                <Plus className="h-[18px] w-[18px]" />New project here
              </button>
            )}
            {l.kind === 'project' && areas.length > 0 && (
              <>
                <hr className="mx-1 my-1.5 border-border/70" />
                <p className="px-2.5 pb-1 pt-0.5 text-[length:calc(11.5px*var(--ts))] font-semibold uppercase tracking-wider text-muted-foreground">Move to area</p>
                {l.areaId !== null && (
                  <button role="menuitem" className={MENU_ITEM} onClick={() => { close(); patchList(l.id, { areaId: null }) }}>
                    <Layers className="h-[18px] w-[18px]" />No area
                  </button>
                )}
                {areas.filter((a) => a.id !== l.areaId).map((a) => (
                  <button key={a.id} role="menuitem" className={MENU_ITEM} onClick={() => { close(); patchList(l.id, { areaId: a.id }) }}>
                    <Square className="h-[18px] w-[18px]" /><span className="truncate">{a.title || 'Untitled area'}</span>
                  </button>
                ))}
              </>
            )}
            <hr className="mx-1 my-1.5 border-border/70" />
            <button role="menuitem" className={MENU_ITEM} onClick={() => { close(); patchList(l.id, { hideFromToday: !l.hideFromToday }) }}>
              {l.hideFromToday ? <Eye className="h-[18px] w-[18px]" /> : <EyeOff className="h-[18px] w-[18px]" />}
              {l.hideFromToday ? 'Show on Today' : 'Hide from Today'}
            </button>
            <button role="menuitem" className={MENU_ITEM} onClick={() => { close(); patchList(l.id, { done: true }); if (view === target) onSelect('anytime') }}>
              <Check className="h-[18px] w-[18px]" />{l.kind === 'project' ? 'Complete project' : 'Complete area'}
            </button>
            <button role="menuitem" className={`${MENU_ITEM} text-red-500`} onClick={() => { close(); if (!window.confirm(`Delete “${l.title || 'Untitled'}”?`)) return; removeList(l); if (view === target) onSelect('anytime') }}>
              <Trash2 className="h-[18px] w-[18px]" />Delete {l.kind}
            </button>
          </ContextMenu>
        )
      })()}
    </>
  )
}
