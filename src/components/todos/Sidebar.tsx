'use client'

import { useMemo, useState } from 'react'
import { Inbox as ProposalsIcon, Keyboard, Mic, Moon, Plus, Search, SlidersHorizontal, Square, Sun } from 'lucide-react'
import { useMode } from '@/lib/useMode'
import { addDays } from '@/lib/date'
import { byOrder, counts, progress, type StandardView } from '@/lib/todo-views'
import type { Todo } from '@/lib/todos'
import { useTodos } from './TodosProvider'
import { ProgressRing, VIEW_META } from './parts'
import { AiBalance } from './AiBalance'
import { AttachButton } from '@/components/chat/attachments'
import { ASSISTANT_TRIGGER } from '@/components/today/TodayAssistant'
import { WORLD_META } from '@/components/world/meta'
import type { WorldKind } from '@/lib/identity'

/** What dropping a to-do on a list means, in fields. */
function dropChanges(todo: Todo, target: string, today: string): Partial<Todo> | 'complete' | null {
  if (target.startsWith('project:') || target.startsWith('area:')) {
    return { listId: Number(target.split(':')[1]) }
  }
  // The day a repeating habit is due is worked out, not set.
  if (todo.type !== 'Task') return null
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
const TOOL = 'grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]'
const ROW = 'flex items-center gap-2 max-md:gap-3 w-full px-2 py-[3.5px] max-md:py-2 rounded-md text-[13.5px] max-md:text-[16px] leading-5 text-left select-none'

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
  view, onSelect, pendingCount, open, slim, onQuickFind, onCapture, onAttach, world,
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
  /** Your World, when it is switched on: which world it draws. */
  world: WorldKind | null
}) {
  const { todos, lists, date, patch, toggle, dragId, dragIds, setDragIds, plusDragging, setPlusDragging, startDraft, createList } = useTodos()
  const [over, setOver] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
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
      <a key={id} href={`#${id}`} onClick={follow(id)} className={rowClass(id, 'font-medium')} {...dropProps(id)}>
        <Icon className={`w-4 h-4 shrink-0 ${tone}`} />
        <span className="flex-1 truncate">{title}</span>
        {/* What is due, in red, beside everything that is for today. */}
        {!!due && <span className="text-[11px] font-semibold tabular-nums text-white bg-red-500 rounded-full px-[5px] leading-4 min-w-4 text-center">{due}</span>}
        {!!count && <span className="text-[12px] tabular-nums text-muted-foreground">{count}</span>}
      </a>
    )
  }

  const project = (p: (typeof projects)[number]) => {
    const target = `project:${p.id}`
    const left = todos.filter((t) => t.listId === p.id && t.type === 'Task' && !t.done).length
    return (
      <a key={p.id} href={`#${target}`} onClick={follow(target)} className={rowClass(target)} {...dropProps(target)}>
        <ProgressRing value={progress(p, todos)} size={14} className="text-muted-foreground mx-px" />
        <span className="flex-1 truncate">{p.title || 'Untitled project'}</span>
        {left > 0 && <span className="text-[12px] tabular-nums text-muted-foreground">{left}</span>}
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
          flex flex-col min-h-0 w-[240px] shrink-0 bg-sidebar border-r border-border/60
          max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:border-r-0
          max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]
          max-md:transition-transform max-md:duration-200 motion-reduce:transition-none
          ${open ? '' : 'max-md:-translate-x-[102%]'} ${slim ? 'md:hidden' : ''}
        `}
      >
        <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 pt-3 pb-3">
          {standard('inbox', c.inbox)}
          <div className="h-3" />
          {standard('today', c.today, c.due)}
          {standard('upcoming')}
          {standard('anytime')}
          {standard('someday')}
          <div className="h-3" />
          {standard('logbook')}
          {world && (() => {
            const { Icon } = WORLD_META[world]
            return (
              <a href="#world" onClick={follow('world')} className={rowClass('world', 'font-medium')}>
                <Icon className="w-4 h-4 shrink-0 text-violet-500" />
                <span className="flex-1 truncate">Your World</span>
              </a>
            )
          })()}
          <div className="h-3" />

          {projects.filter((p) => !p.areaId || !areaIds.has(p.areaId)).map(project)}
          {areas.map((a) => {
            const target = `area:${a.id}`
            return (
              <div key={a.id}>
                <a href={`#${target}`} onClick={follow(target)} className={rowClass(target, 'font-bold mt-3')} {...dropProps(target)}>
                  <Square className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{a.title || 'Untitled area'}</span>
                </a>
                {projects.filter((p) => p.areaId === a.id).map(project)}
              </div>
            )
          })}
        </nav>

        {/* The way in to the assistant, on every screen: say it (the big
            one, in the theme's colour, so it is the first thing found), type
            it, or hand it a document. It opens over the foot of the list. */}
        <div className="shrink-0 flex items-center gap-1.5 px-2.5 pb-2.5" {...{ [ASSISTANT_TRIGGER]: '' }}>
          <button
            onClick={() => onCapture('listen')}
            className="flex-1 min-w-0 flex items-center justify-center gap-2 h-9 max-md:h-11 rounded-xl bg-primary text-primary-foreground text-[13.5px] max-md:text-[15px] font-semibold hover:opacity-90 active:scale-[0.98] transition"
          >
            <Mic className="w-4 h-4 max-md:w-[18px] max-md:h-[18px] shrink-0" /> Quick Capture
          </button>
          <button
            onClick={() => onCapture('type')}
            title="Type it instead"
            aria-label="Type it instead"
            className="grid place-items-center shrink-0 w-9 h-9 max-md:w-11 max-md:h-11 rounded-xl bg-foreground/[0.06] text-foreground/75 hover:text-foreground hover:bg-foreground/[0.09]"
          >
            <Keyboard className="w-4 h-4" />
          </button>
          <AttachButton
            bare
            onFiles={onAttach}
            className="w-7 h-7 max-md:w-9 max-md:h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
          />
        </div>

        {/* One line at the foot, as in Things: add a list on the left, the
            app's own controls as quiet icons on the right. */}
        {/* Exactly as tall as the list's bottom toolbar (TodoView), so the two lines meet across the window. */}
        <div className="relative flex items-center gap-0.5 px-2.5 h-[45px] shrink-0 border-t border-border/70">
          {adding && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAdding(false)} />
              <div className="absolute z-50 bottom-full left-2.5 mb-1 w-[190px] p-1.5 rounded-lg border border-border/70 bg-popover shadow-xl">
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
          <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 whitespace-nowrap px-2 py-1 -ml-0.5 rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]">
            <Plus className="w-4 h-4 shrink-0" /> New List
          </button>
          <AiBalance />
          <span className="flex-1" />
          {/* A phone has no keyboard to start typing on, so Quick Find gets a button there. */}
          <button onClick={onQuickFind} title="Quick Find" aria-label="Quick Find" className={`${TOOL} md:hidden`}>
            <Search className="w-4 h-4" />
          </button>
          {pendingCount > 0 && (
            <button onClick={() => onSelect('proposals')} title="Waiting for your yes or no" className={`${TOOL} relative ${view === 'proposals' ? 'text-foreground' : ''}`} aria-label={`${pendingCount} to review`}>
              <ProposalsIcon className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-primary text-primary-foreground rounded-full min-w-3.5 px-[3px] leading-[14px] text-center">{pendingCount}</span>
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
    </>
  )
}
