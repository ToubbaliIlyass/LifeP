'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowRight, Archive, CalendarDays, Clock, Flag, MapPin, Moon, Plus, Repeat, Star, Trash2, X } from 'lucide-react'
import type { ChecklistItem, Todo, TodoList } from '@/lib/todos'
import { relDate, repeatLabel } from '@/lib/todo-views'
import { parseEntry, saysMore } from '@/lib/quick-entry'
import { EVENING_TONE, SOMEDAY_TONE, TodoCheck } from './parts'

export type PopKind = 'when' | 'time' | 'deadline' | 'move' | 'repeat'

const newId = () => Math.random().toString(36).slice(2, 9)

/** A textarea as tall as what is in it. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

const PILL = 'inline-flex items-center gap-1.5 max-w-[220px] text-[12.5px] px-2 py-1 rounded-md border transition-colors'

/**
 * A to-do, opened in place.
 *
 * It grows out of its own row rather than opening over the list, so the list
 * is still there around it: title, notes, a checklist, tags, and the three
 * decisions — when, by when, and where it belongs. Everything saves as it is
 * typed; closing is just clicking away.
 */
export function TodoEditor({
  todo, lists, today, autoFocus, onPatch, onToggle, onDelete, onClose, onPop,
}: {
  todo: Todo
  lists: TodoList[]
  today: string
  autoFocus: boolean
  onPatch: (changes: Partial<Todo>) => void
  onToggle: () => void
  onDelete: () => void
  onClose: () => void
  onPop: (kind: PopKind, anchor: HTMLElement) => void
}) {
  const root = useRef<HTMLLIElement>(null)
  /** A selector to focus once the next render has put it on the page. */
  const focusNext = useRef<string | null>(autoFocus ? '[data-title]' : null)
  useEffect(() => {
    if (!focusNext.current) return
    const el = root.current?.querySelector<HTMLInputElement>(focusNext.current)
    focusNext.current = null
    if (!el) return
    el.focus()
    const n = el.value.length
    try { el.setSelectionRange(n, n) } catch { /* not a text field */ }
    el.scrollIntoView({ block: 'nearest' })
  })

  /** The whole line, read as it is typed — shown as chips, then applied on save. */
  const entry = todo.id < -900 && !todo.literal ? parseEntry(todo.title, today) : null
  // "event: …" typed first makes it one, without touching the switch.
  const isEvent = entry?.kind ? entry.kind === 'event' : todo.asEvent === true
  const isTask = todo.type === 'Task' && !isEvent
  const isDraft = todo.id < -900
  const list = lists.find((l) => l.id === todo.listId)
  const setChecklist = (checklist: ChecklistItem[]) => onPatch({ checklist })

  /**
   * A list pasted into the checklist becomes the checklist: "- eggs\n- milk",
   * "1. pack\n2. leave", or plain lines, from wherever it was copied.
   */
  function pasteList(e: React.ClipboardEvent<HTMLInputElement>, after: number) {
    const lines = e.clipboardData.getData('text').split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•◦▪‣]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
      .filter(Boolean)
    if (lines.length < 2) return
    e.preventDefault()
    const items = lines.map((text) => ({ id: newId(), text, done: false }))
    setChecklist([...todo.checklist.slice(0, after), ...items, ...todo.checklist.slice(after)])
  }

  function addTags(raw: string) {
    const next = [...todo.tags]
    for (const tag of raw.split(/[,\s]+/).map((s) => s.replace(/^#/, '').trim()).filter(Boolean)) {
      if (!next.includes(tag)) next.push(tag)
    }
    if (next.length !== todo.tags.length) onPatch({ tags: next })
  }

  let when = <><CalendarDays className="w-[15px] h-[15px]" /><span className="truncate">When</span></>
  let whenOn = false
  if (todo.someday) {
    when = <><Archive className={`w-[15px] h-[15px] ${SOMEDAY_TONE}`} /><span className="truncate">Someday</span></>
    whenOn = true
  } else if (todo.when && todo.when <= today) {
    when = todo.evening
      ? <><Moon className={`w-[15px] h-[15px] ${EVENING_TONE}`} /><span className="truncate">This evening</span></>
      : <><Star className="w-[15px] h-[15px] text-amber-400 fill-amber-400" /><span className="truncate">Today</span></>
    whenOn = true
  } else if (todo.when) {
    when = <><CalendarDays className="w-[15px] h-[15px]" /><span className="truncate">{relDate(todo.when, today)}</span></>
    whenOn = true
  }
  const pill = (on: boolean, extra = '') =>
    `${PILL} ${on ? `border-border/80 text-foreground ${extra}` : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/[0.045]'}`

  return (
    <li
      ref={root}
      data-editor
      data-todo-id={todo.id}
      className="flex gap-2 items-start my-2.5 -mx-3 max-md:-mx-2 px-3 max-md:px-2 pt-3 pb-2.5 rounded-[10px] leading-[22px] bg-card border border-border/70 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_28px_rgb(0_0_0/0.10)]"
    >
      <TodoCheck done={todo.done} onClick={onToggle} />
      <div className="flex-1 min-w-0">
        {/* A new item can be either: something to do, or something to show up to. */}
        {isDraft && (
          <div className="float-right ml-2 -mt-0.5 inline-flex rounded-md bg-foreground/[0.06] p-0.5 text-[12px] font-medium">
            {([['To-do', false], ['Event', true]] as const).map(([label, value]) => (
              <button
                key={label}
                type="button"
                aria-pressed={isEvent === value}
                onClick={() => onPatch({ asEvent: value })}
                className={`px-2 py-0.5 rounded ${isEvent === value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <input
          data-title
          value={todo.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClose() } }}
          placeholder={isEvent ? 'Dentist fri at 3pm for 1h @clinic' : isDraft ? 'Review ML do tomorrow due fri for 45m #school' : 'New to-do'}
          aria-label="Title"
          className="block w-full bg-transparent outline-none text-[14px] font-medium leading-[22px] placeholder:text-muted-foreground/50 placeholder:font-normal"
        />
        {entry && saysMore(entry) && (
          // What the line says, piece by piece — it becomes exactly this on save.
          <div className="flex flex-wrap items-center gap-1 mt-1 text-[12px]">
            {entry.title && entry.title !== todo.title.trim() && <span className="font-medium text-foreground/80 mr-0.5">“{entry.title}”</span>}
            {entry.pieces.map((p) => (
              <span key={p} className="rounded-[4px] bg-primary/[0.12] text-primary px-1.5 leading-[18px] font-medium">{p}</span>
            ))}
            <button type="button" onClick={() => onPatch({ literal: true })} className="ml-1 text-muted-foreground hover:text-foreground underline underline-offset-2">
              keep the words
            </button>
          </div>
        )}
        {isDraft && !todo.title && (
          // The shorthand, while there is nothing typed to show it on.
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/80">
            <b className="font-semibold">event:</b> or <b className="font-semibold">todo:</b> first, then any of
            {' '}<b className="font-semibold">do</b> fri · <b className="font-semibold">due</b> mon · <b className="font-semibold">at</b> 3pm · <b className="font-semibold">for</b> 45m · #tag · !! · <b className="font-semibold">every</b> day x5 · /project · @place
          </p>
        )}
        {isEvent && (
          <label className="flex items-center gap-1.5 mt-1.5 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <input
              value={todo.location ?? ''}
              onChange={(e) => onPatch({ location: e.target.value })}
              placeholder="Where (optional)"
              aria-label="Where"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] text-foreground placeholder:text-muted-foreground/50"
            />
          </label>
        )}
        {!isEvent && <AutoTextarea
          value={todo.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
          placeholder="Notes"
          aria-label="Notes"
          className="block w-full mt-0.5 bg-transparent outline-none resize-none overflow-hidden text-[13.5px] text-muted-foreground leading-normal min-h-[20px] placeholder:text-muted-foreground/50"
        />}

        {isTask && (
          <ul className="mt-2.5">
            {todo.checklist.map((c, i) => (
              <li key={c.id} data-cid={c.id} className="group/cl flex items-center gap-2 py-[3px] border-b border-border/60">
                <TodoCheck
                  small
                  done={c.done}
                  label="Toggle item"
                  onClick={() => setChecklist(todo.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
                />
                <input
                  value={c.text}
                  aria-label="Checklist item"
                  onPaste={(e) => pasteList(e, i + 1)}
                  onChange={(e) => setChecklist(todo.checklist.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const item = { id: newId(), text: '', done: false }
                      focusNext.current = `[data-cid="${item.id}"] input`
                      setChecklist([...todo.checklist.slice(0, i + 1), item, ...todo.checklist.slice(i + 1)])
                    } else if (e.key === 'Backspace' && !c.text) {
                      e.preventDefault()
                      const prev = todo.checklist[i - 1]
                      focusNext.current = prev ? `[data-cid="${prev.id}"] input` : '[data-cl-new]'
                      setChecklist(todo.checklist.filter((x) => x.id !== c.id))
                    }
                  }}
                  className={`flex-1 min-w-0 bg-transparent outline-none text-[13.5px] py-[2px] ${c.done ? 'text-muted-foreground line-through' : ''}`}
                />
                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => setChecklist(todo.checklist.filter((x) => x.id !== c.id))}
                  className="grid place-items-center w-6 h-6 rounded-md text-muted-foreground opacity-0 group-hover/cl:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-foreground/[0.045]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            <li className="flex items-center gap-2 py-[3px]">
              <span className="w-[13px] grid place-items-center text-muted-foreground/50"><Plus className="w-3 h-3" /></span>
              <input
                data-cl-new
                placeholder="Add checklist item — or paste a list"
                aria-label="Add checklist item"
                onPaste={(e) => pasteList(e, todo.checklist.length)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const text = e.currentTarget.value.trim()
                  if (!text) return
                  e.currentTarget.value = ''
                  setChecklist([...todo.checklist, { id: newId(), text, done: false }])
                }}
                className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] py-[2px] placeholder:text-muted-foreground/50"
              />
            </li>
          </ul>
        )}

        {!isEvent && <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {todo.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 text-[12.5px] bg-foreground/[0.05] text-muted-foreground rounded-md pl-2 pr-[3px] py-0.5">
              #{tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onPatch({ tags: todo.tags.filter((t) => t !== tag) })}
                className="grid place-items-center w-[18px] h-[18px] rounded text-muted-foreground/60 hover:text-foreground"
              >
                <X className="w-[11px] h-[11px]" />
              </button>
            </span>
          ))}
          <input
            placeholder={todo.tags.length ? 'Add tag' : 'Add tags'}
            aria-label="Add tag"
            onKeyDown={(e) => {
              const el = e.currentTarget
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                if (el.value.trim()) { addTags(el.value); el.value = '' }
              } else if (e.key === 'Backspace' && !el.value && todo.tags.length) {
                onPatch({ tags: todo.tags.slice(0, -1) })
              }
            }}
            onBlur={(e) => { if (e.currentTarget.value.trim()) { addTags(e.currentTarget.value); e.currentTarget.value = '' } }}
            className="flex-1 min-w-[90px] bg-transparent outline-none text-[13px] py-0.5 placeholder:text-muted-foreground/50"
          />
        </div>}

        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-border/60">
          {isTask || isEvent ? (
            <>
              <button type="button" className={pill(whenOn)} onClick={(e) => onPop('when', e.currentTarget)}>{when}</button>
              {/* The time on its day: the slot it is planned in, and when it reminds you. */}
              {!todo.someday && (
                <button type="button" className={pill(!!todo.time)} onClick={(e) => onPop('time', e.currentTarget)}>
                  <Clock className="w-[15px] h-[15px]" />
                  <span className="truncate tabular-nums">
                    {todo.time ? `${todo.time}${todo.minutes ? ` · ${todo.minutes < 60 ? `${todo.minutes}m` : `${todo.minutes / 60}h`}` : ''}` : 'Time'}
                  </span>
                </button>
              )}
              {isTask && (
                <button type="button" className={pill(!!todo.deadline, 'text-red-500')} onClick={(e) => onPop('deadline', e.currentTarget)}>
                  <Flag className="w-[15px] h-[15px]" />
                  <span className="truncate">{todo.deadline ? `Due ${relDate(todo.deadline, today)}` : 'Deadline'}</span>
                </button>
              )}
            </>
          ) : null}
          {isTask && (
            // Priority: marked, or not. "!!" in a new to-do's line sets it too.
            <button type="button" className={pill(todo.priority === 'high', 'text-red-500')} aria-pressed={todo.priority === 'high'} onClick={() => onPatch({ priority: todo.priority === 'high' ? null : 'high' })}>
              <span className="font-bold leading-none">!!</span>
              <span className="truncate">{todo.priority === 'high' ? 'High' : 'Priority'}</span>
            </button>
          )}
          {/* Any to-do can come round again; nothing has to be a "habit" first. */}
          <button type="button" className={pill(!!todo.repeats)} onClick={(e) => onPop('repeat', e.currentTarget)}>
            <Repeat className={`w-[15px] h-[15px] ${todo.repeats ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
            <span className="truncate">{todo.repeats ? repeatLabel(todo.repeats) : 'Repeat'}</span>
          </button>
          {!isEvent && (
            <button type="button" className={pill(false)} onClick={(e) => onPop('move', e.currentTarget)}>
              <ArrowRight className="w-[15px] h-[15px]" />
              <span className="truncate">{list ? list.title || 'Untitled' : isTask ? 'Inbox' : 'No list'}</span>
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete to-do"
            className="grid place-items-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.045]"
          >
            <Trash2 className="w-[17px] h-[17px]" />
          </button>
        </div>
      </div>
    </li>
  )
}
