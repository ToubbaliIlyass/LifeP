'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Square, Tag } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import type { Todo } from '@/lib/todos'
import { STANDARD_VIEWS, inInbox, isSomeday, isToday, isUpcoming, progress } from '@/lib/todo-views'
import { useTodos } from './TodosProvider'
import { ProgressRing, TodoCheck, VIEW_META } from './parts'

type Hit =
  | { kind: 'view'; key: string; label: string; icon: React.ReactNode; go: string }
  | { kind: 'tag'; key: string; label: string; go: string }
  | { kind: 'todo'; key: string; todo: Todo; where: string; go: string }

/** The list a to-do is in, to take you there. */
export function homeOf(t: Todo, today: string): string {
  if (t.listId) return `list:${t.listId}`
  if (t.done) return 'logbook'
  if (isToday(t, today)) return 'today'
  if (isUpcoming(t, today)) return 'upcoming'
  if (isSomeday(t)) return 'someday'
  if (inInbox(t)) return 'inbox'
  return 'anytime'
}

/**
 * Quick Find: start typing, and go.
 *
 * Opened by typing anywhere a list has nothing selected (the first letter
 * carries over), by / or ⌘K. Lists come first, then tags — choosing one
 * filters every list by it — then to-dos, which open where they live.
 */
export function QuickFind({ initial, onClose, onNavigate }: {
  initial: string
  onClose: () => void
  onNavigate: (view: string) => void
}) {
  const { todos, lists, date: today, requestOpen } = useTodos()
  const [q, setQ] = useState(initial)
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const text = q.trim().toLowerCase()
    if (!text) return []
    const tagOnly = text.startsWith('#')
    const needle = text.replace(/^#/, '')
    const has = (s: string) => s.toLowerCase().includes(needle)
    const out: Hit[] = []
    if (!tagOnly) {
      for (const id of STANDARD_VIEWS) {
        const { title, Icon, tone } = VIEW_META[id]
        if (has(title)) out.push({ kind: 'view', key: id, label: title, icon: <Icon className={`w-4 h-4 ${tone}`} />, go: id })
      }
      for (const l of lists) {
        if (l.done || !has(l.title)) continue
        out.push({
          kind: 'view', key: `l${l.id}`, label: l.title, go: `${l.kind}:${l.id}`,
          icon: l.kind === 'project' ? <ProgressRing value={progress(l, todos)} size={15} className="text-muted-foreground" /> : <Square className="w-4 h-4 text-muted-foreground" />,
        })
      }
    }
    for (const tag of [...new Set(todos.flatMap((t) => t.tags))].sort()) {
      if (has(tag)) out.push({ kind: 'tag', key: `#${tag}`, label: tag, go: `tag:${tag}` })
    }
    if (!tagOnly) {
      const found = todos
        .filter((t) => t.id > 0 && (has(t.title) || has(t.notes) || t.checklist.some((c) => has(c.text))))
        .sort((a, b) => Number(a.done) - Number(b.done))
        .slice(0, 8)
      for (const t of found) {
        const home = homeOf(t, today)
        const l = home.startsWith('list:') ? lists.find((x) => x.id === Number(home.slice(5))) : null
        out.push({
          kind: 'todo', key: `t${t.id}`, todo: t,
          where: l ? l.title || 'Untitled' : VIEW_META[home as keyof typeof VIEW_META]?.title ?? '',
          go: l ? `${l.kind}:${l.id}` : home,
        })
      }
    }
    return out
  }, [q, todos, lists, today])

  function choose(hit: Hit | undefined) {
    if (!hit) return
    if (hit.kind === 'todo') requestOpen(hit.todo.id)
    onClose()
    onNavigate(hit.go)
  }

  const row = (hit: Hit, i: number) => {
    const on = i === at
    const cls = `flex items-center gap-2.5 w-full text-left px-3 py-1.5 rounded-md ${on ? 'bg-primary/[0.12]' : ''}`
    if (hit.kind === 'todo') {
      return (
        <button key={hit.key} className={cls} onMouseEnter={() => setAt(i)} onClick={() => choose(hit)}>
          <span className="pointer-events-none"><TodoCheck done={hit.todo.done} onClick={() => {}} /></span>
          <span className={`flex-1 min-w-0 truncate ${hit.todo.done ? 'text-muted-foreground line-through' : ''}`}>{hit.todo.title}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">{hit.where}</span>
        </button>
      )
    }
    return (
      <button key={hit.key} className={cls} onMouseEnter={() => setAt(i)} onClick={() => choose(hit)}>
        {hit.kind === 'tag' ? <Tag className="w-4 h-4 text-muted-foreground" /> : hit.icon}
        <span className="flex-1 min-w-0 truncate">{hit.label}</span>
        {hit.kind === 'tag' && <span className="text-[12px] text-muted-foreground">Everything tagged</span>}
      </button>
    )
  }

  return (
    <div role="dialog" aria-label="Quick Find" className="fixed inset-0 z-[70] flex items-start justify-center bg-black/10 pt-[14vh] px-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-[520px] rounded-xl border border-border/70 bg-popover shadow-[0_2px_6px_rgb(0_0_0/0.08),0_18px_48px_rgb(0_0_0/0.22)] overflow-hidden">
        <label className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/60">
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setAt(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose() }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(hits.length - 1, i + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); choose(hits[at]) }
            }}
            placeholder="Quick Find — a list, a to-do, or #tag"
            aria-label="Quick Find"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          />
        </label>
        {q.trim() && (
          <div className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5 text-[14px]">
            {hits.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-1 text-muted-foreground">
                <Tuck state="not-found" size={52} decorative />Nothing called that. Wrong tunnel?
              </p>
            ) : hits.map(row)}
          </div>
        )}
      </div>
    </div>
  )
}
