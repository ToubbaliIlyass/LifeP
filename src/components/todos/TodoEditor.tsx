'use client'

import { FocusLog } from '@/components/focus/FocusLog'
import { useFocus } from '@/components/focus/useFocus'
import { focusedMs, isRunning, spentText } from '@/lib/focus'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Archive, Bell, CalendarDays, Check, Clock, Ellipsis, Flag, ListChecks, MapPin, Moon, Plus, Repeat, SkipForward, Star, Timer, Trash2, X } from 'lucide-react'
import type { ChecklistItem, Todo, TodoList } from '@/lib/todos'
import { relDate, repeatLabel, skipLabel } from '@/lib/todo-views'
import { parseEntry, saysMore } from '@/lib/quick-entry'
import { lead } from '@/lib/reminders'
import { EVENING_TONE, SOMEDAY_TONE, TodoCheck } from './parts'
import { RhythmCard } from './Rhythm'
import { BTN_PRIMARY } from '@/components/ui/buttons'

export type PopKind = 'when' | 'time' | 'deadline' | 'move' | 'repeat' | 'remind'

/** What a to-do's reminder says on its button and in its row: "17:00", "10 min before", "Fri 09:00". */
export function reminderLabel(t: Pick<Todo, 'reminder' | 'remindBefore' | 'remindAt' | 'time'>, today: string): string | null {
  if (t.remindBefore) return `${lead(t.remindBefore).replace(/minutes?/, 'min')} before`
  if (t.remindAt) return `${relDate(t.remindAt.slice(0, 10), today)} ${t.remindAt.slice(11)}`
  if (t.reminder) return t.reminder
  return null
}

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

const PILL = 'inline-flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap min-w-0 text-[length:calc(12.5px*var(--ts))] max-md:text-[length:calc(14.5px*var(--ts))] px-2 max-md:px-3 py-1 max-md:py-2 max-md:min-h-10 rounded-md max-md:rounded-lg border transition-colors'

/**
 * A to-do, opened in place.
 *
 * It grows out of its own row rather than opening over the list, so the list
 * is still there around it: title, notes, a checklist, tags, and the three
 * decisions — when, by when, and where it belongs. Everything saves as it is
 * typed; closing is just clicking away.
 */
export function TodoEditor({
  todo, lists, today, autoFocus, onPatch, onToggle, onSkip, onDelete, onClose, onPop,
}: {
  todo: Todo
  lists: TodoList[]
  today: string
  autoFocus: boolean
  onPatch: (changes: Partial<Todo>) => void
  onToggle: () => void
  /** Only for a repeating to-do that is open: skips this time round. */
  onSkip?: () => void
  onDelete: () => void
  onClose: () => void
  onPop: (kind: PopKind, anchor: HTMLElement) => void
}) {
  const root = useRef<HTMLLIElement>(null)
  const focus = useFocus()
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

  // On a phone the keyboard rises after the field is focused and would cover the card: bring it into view
  // now, and again when the visible area shrinks.
  useEffect(() => {
    const show = () => root.current?.scrollIntoView({ block: 'nearest' })
    const t = setTimeout(show, 60)
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    vv?.addEventListener('resize', show)
    return () => { clearTimeout(t); vv?.removeEventListener('resize', show) }
  }, [])
  /** On a phone only the first three buttons show; the rest are one tap away. */
  const [more, setMore] = useState(false)
  const hide = (on: boolean) => (!more && !on ? 'max-md:hidden' : '')
  /** On a wide screen an empty pill is just its icon (the name is its tooltip), so the whole row fits on one line. */
  const short = (on: boolean) => (on ? '' : 'md:hidden')

  const isDraft = todo.id < -900
  /** A phone's empty new draft shows only the title and the buttons: room for the keyboard. Notes, checklist and tags appear once there are words. */
  const lean = isDraft && !todo.title.trim() && !todo.notes.trim() && todo.checklist.length === 0 && todo.tags.length === 0
  /** The title as it was when this opened, so only words added since are read. */
  const [opened] = useState(todo.title)
  const deleting = useRef(false)
  /**
   * The whole line, read as it is typed — shown as chips, then applied on
   * save. A new to-do reads all of it; one that already exists reads it only
   * once its title has been changed, and never as another kind of thing.
   */
  const typed = !todo.literal && (isDraft || (todo.type === 'Task' && todo.title !== opened))
  const parsed = typed ? parseEntry(todo.title, today) : null
  const entry = parsed && (isDraft || (!parsed.kind && saysMore(parsed))) ? parsed : null
  // "event: …" typed first makes it one, without touching the switch.
  const isEvent = isDraft && entry?.kind ? entry.kind === 'event' : todo.asEvent === true
  const isTask = todo.type === 'Task' && !isEvent

  /*
   * Closing a to-do that was already there: what its new title says is
   * applied, and the words that said it come off the title. Done once, on the
   * way out, from the latest render — the same line a new to-do takes.
   */
  const closing = useRef<() => void>(() => {})
  useEffect(() => {
    closing.current = () => {
      if (isDraft || deleting.current || !entry) return
      const changes: Partial<Todo> = { title: entry.title || todo.title }
      if (entry.someday) changes.someday = true
      else if (entry.when) { changes.when = entry.when; changes.someday = false; changes.evening = entry.evening }
      if (entry.time) { changes.time = entry.time; changes.reminder = entry.time }
      if (entry.minutes) changes.minutes = entry.minutes
      if (entry.repeats) { changes.repeats = entry.repeats; changes.repeatDays = entry.repeatDays }
      if (entry.deadline) changes.deadline = entry.deadline
      if (entry.priority) changes.priority = entry.priority
      if (entry.tags.length) changes.tags = [...new Set([...todo.tags, ...entry.tags])]
      const q = entry.list?.toLowerCase()
      const named = q ? (lists.find((l) => !l.done && l.title.toLowerCase().startsWith(q)) ?? lists.find((l) => !l.done && l.title.toLowerCase().includes(q))) : undefined
      if (named) changes.listId = named.id
      onPatch(changes)
    }
  })
  useEffect(() => () => closing.current(), [])
  const list = lists.find((l) => l.id === todo.listId)
  const setChecklist = (checklist: ChecklistItem[]) => onPatch({ checklist })
  const [newItem, setNewItem] = useState('')
  function addNewItem() {
    const text = newItem.trim()
    if (!text) return
    setNewItem('')
    setChecklist([...todo.checklist, { id: newId(), text, done: false }])
  }

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
    `${PILL} ${on ? `border-primary/40 bg-primary/[0.12] text-foreground ${extra}` : 'md:flex-none md:px-1.5 border-transparent bg-foreground/[0.05] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.085]'}`

  return (
    <li
      ref={root}
      data-editor
      data-todo-id={todo.id}
      className="flex gap-2 items-start my-2.5 scroll-mb-3 -mx-3 max-md:-mx-2 px-3 max-md:px-2 pt-3 pb-2.5 rounded-[10px] leading-[22px] bg-card border border-border/70 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_28px_rgb(0_0_0/0.10)]"
    >
      {/* Nothing to tick until it exists. */}
      {isDraft ? <span className="w-[22px] shrink-0" aria-hidden /> : <TodoCheck done={todo.done} label={todo.done ? `Mark “${todo.title}” as not done` : `Complete “${todo.title}”`} onClick={onToggle} />}
      <div className="flex-1 min-w-0">
        <AutoTextarea
          data-title
          value={todo.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClose() } }}
          placeholder={isEvent ? 'Dentist fri at 3pm for 1h @clinic' : isDraft ? 'Review ML do tomorrow due fri for 45m #school' : 'New to-do'}
          aria-label="Title"
          // Long titles wrap onto the next line, so all of it can be read.
          className="block w-full resize-none overflow-hidden [overflow-wrap:anywhere] bg-transparent outline-none text-[length:calc(14px*var(--ts))] max-md:text-[length:calc(17px*var(--ts))] font-medium leading-[22px] max-md:leading-6 placeholder:text-muted-foreground/50 placeholder:font-normal"
        />
        {entry && saysMore(entry) && (
          // What the line says, piece by piece — it becomes exactly this on save.
          <div className="flex flex-wrap items-center gap-1 mt-1 text-[length:calc(12px*var(--ts))]">
            {entry.title && entry.title !== todo.title.trim() && <span className="font-medium text-foreground/80 mr-0.5">“{entry.title}”</span>}
            {entry.pieces.map((p) => (
              <span key={p} className="rounded-[4px] bg-primary/[0.14] text-primary-ink px-1.5 leading-[18px] font-medium">{p}</span>
            ))}
            <button type="button" onClick={() => onPatch({ literal: true })} className="ml-1 text-muted-foreground hover:text-foreground underline underline-offset-2">
              keep the words
            </button>
          </div>
        )}
        {isDraft && !todo.title && (
          // The shorthand, while there is nothing typed to show it on.
          <p className="mt-1 text-[length:calc(12px*var(--ts))] leading-relaxed text-muted-foreground/80 max-md:hidden">
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
              className="flex-1 min-w-0 bg-transparent outline-none text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] text-foreground placeholder:text-muted-foreground/50"
            />
          </label>
        )}
        {!isEvent && <AutoTextarea
          value={todo.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
          placeholder="Notes"
          aria-label="Notes"
          className={`block w-full mt-0.5 bg-transparent outline-none resize-none overflow-hidden text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] text-muted-foreground leading-normal min-h-[20px] placeholder:text-muted-foreground/50 ${lean ? 'max-md:hidden' : ''}`}
        />}

        {isTask && (
          <ul className={`mt-2.5 ${lean ? 'max-md:hidden' : ''}`}>
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
                  className={`flex-1 min-w-0 bg-transparent outline-none text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] py-[2px] max-md:py-1.5 ${c.done ? 'text-muted-foreground line-through' : ''}`}
                />
                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => setChecklist(todo.checklist.filter((x) => x.id !== c.id))}
                  className="grid place-items-center w-6 h-6 rounded-md text-muted-foreground opacity-0 group-hover/cl:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-foreground/[0.045] max-md:h-10 max-md:w-10 max-md:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            <li className="flex items-center gap-2 py-[3px]">
              <span className="w-[13px] grid place-items-center text-muted-foreground/50"><Plus className="w-3 h-3" /></span>
              <input
                data-cl-new
                value={newItem}
                enterKeyHint="done"
                placeholder="Add checklist item"
                aria-label="Add checklist item"
                onChange={(e) => setNewItem(e.target.value)}
                onPaste={(e) => pasteList(e, todo.checklist.length)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  addNewItem()
                }}
                // Phone keyboards do not always send Enter: leaving the field keeps what was typed.
                onBlur={addNewItem}
                className="flex-1 min-w-0 bg-transparent outline-none text-[length:calc(13.5px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] py-[2px] max-md:py-1.5 placeholder:text-muted-foreground/50"
              />
              {newItem.trim() && (
                <button
                  type="button"
                  // Before the field blurs, so the tap adds the item once.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addNewItem}
                  className="shrink-0 rounded-md bg-foreground/[0.07] px-2.5 py-1 text-[length:calc(12.5px*var(--ts))] font-semibold hover:bg-foreground/[0.12] max-md:h-10 max-md:px-3.5 max-md:text-[length:calc(14.5px*var(--ts))]"
                >
                  Add
                </button>
              )}
            </li>
          </ul>
        )}

        {!isEvent && <div className={`flex flex-wrap items-center gap-1.5 mt-2.5 ${lean ? 'max-md:hidden' : ''}`}>
          {todo.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 text-[length:calc(12.5px*var(--ts))] max-md:text-[length:calc(14px*var(--ts))] bg-foreground/[0.05] text-muted-foreground rounded-md pl-2 pr-[3px] py-0.5 max-md:py-1">
              #{tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onPatch({ tags: todo.tags.filter((t) => t !== tag) })}
                className="grid place-items-center w-[18px] h-[18px] max-md:w-8 max-md:h-8 rounded text-muted-foreground/60 hover:text-foreground"
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
            className="flex-1 min-w-[90px] bg-transparent outline-none text-[length:calc(13px*var(--ts))] max-md:text-[length:calc(16px*var(--ts))] py-0.5 max-md:py-1.5 placeholder:text-muted-foreground/50"
          />
        </div>}

        {/* Something that comes back has a rhythm worth seeing; a one-off has one tick. */}
        {!isDraft && isTask && !!todo.repeats && !todo.prayerKey && (
          <RhythmCard
            id={todo.id}
            done={todo.done}
            time={todo.time}
            onPlanAt={todo.someday || todo.done ? undefined : (time) => onPatch({ time })}
          />
        )}

        <div className="flex flex-wrap items-center gap-1.5 md:gap-1 mt-3 pt-2.5 border-t border-border/60">
          {isTask || isEvent ? (
            <>
              <button type="button" className={pill(whenOn)} onClick={(e) => onPop('when', e.currentTarget)}>{when}</button>
              {/* The time on its day: the slot it is planned in, and when it reminds you. */}
              {!todo.someday && (
                <button type="button" title="Time" className={pill(!!todo.time)} onClick={(e) => onPop('time', e.currentTarget)}>
                  <Clock className="w-[15px] h-[15px]" />
                  <span className={`truncate tabular-nums ${short(!!todo.time)}`}>
                    {todo.time ? `${todo.time}${todo.minutes ? ` · ${todo.minutes < 60 ? `${todo.minutes}m` : `${todo.minutes / 60}h`}` : ''}` : 'Time'}
                  </span>
                </button>
              )}
              {isTask && (
                <button type="button" title="Deadline" className={pill(!!todo.deadline, 'text-red-500')} onClick={(e) => onPop('deadline', e.currentTarget)}>
                  <Flag className="w-[15px] h-[15px]" />
                  <span className={`truncate ${short(!!todo.deadline)}`}>{todo.deadline ? `Due ${relDate(todo.deadline, today)}` : 'Deadline'}</span>
                </button>
              )}
            </>
          ) : null}
          {isTask && !isDraft && (
            // When it reminds you: at its time, before it, or any moment.
            <button type="button" className={`${pill(!!reminderLabel(todo, today), 'text-amber-600 dark:text-amber-400')} ${hide(!!reminderLabel(todo, today))}`} title="Remind" onClick={(e) => onPop('remind', e.currentTarget)}>
              <Bell className="w-[15px] h-[15px]" />
              <span className={`truncate tabular-nums ${short(!!reminderLabel(todo, today))}`}>{reminderLabel(todo, today) ?? 'Remind'}</span>
            </button>
          )}
          {isTask && (
            // Priority: marked, or not. "!!" in a new to-do's line sets it too.
            <button type="button" className={`${pill(todo.priority === 'high', 'text-red-500')} ${hide(todo.priority === 'high')}`} aria-pressed={todo.priority === 'high'} title="Priority" onClick={() => onPatch({ priority: todo.priority === 'high' ? null : 'high' })}>
              <span className="font-bold leading-none">!!</span>
              <span className={`truncate ${short(todo.priority === 'high')}`}>{todo.priority === 'high' ? 'High' : 'Priority'}</span>
            </button>
          )}
          {isTask && !isDraft && !todo.done && (
            // Start the timer and open the focus screen. Always one tap away, on a phone too: it is what the phone is propped up for.
            <button type="button" title="Focus on this" className={pill(isRunning(todo.sessions ?? []), 'text-primary-ink')} onClick={() => { if (!isRunning(todo.sessions ?? [])) focus.start(todo); focus.open(todo.id) }}>
              <Timer className="w-[15px] h-[15px]" />
              <span className={`truncate tabular-nums ${short(isRunning(todo.sessions ?? []) || focusedMs(todo.sessions ?? [], 0) >= 60000)}`}>{isRunning(todo.sessions ?? []) ? 'Focusing' : focusedMs(todo.sessions ?? [], 0) >= 60000 ? spentText(focusedMs(todo.sessions ?? [], 0)) : 'Focus'}</span>
            </button>
          )}
          {/* Any to-do can come round again. */}
          <button type="button" className={`${pill(!!todo.repeats)} ${hide(!!todo.repeats)}`} title="Repeat" onClick={(e) => onPop('repeat', e.currentTarget)}>
            <Repeat className={`w-[15px] h-[15px] ${todo.repeats ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
            <span className={`truncate ${short(!!todo.repeats)}`}>{todo.repeats ? repeatLabel(todo.repeats) : 'Repeat'}</span>
          </button>
          {!isEvent && (
            <button type="button" className={`${pill(false)} ${hide(false)}`} title="Move to a list" onClick={(e) => onPop('move', e.currentTarget)}>
              <ArrowRight className="w-[15px] h-[15px]" />
              <span className={`truncate ${short(!!list)}`}>{list ? list.title || 'Untitled' : isTask ? 'Inbox' : 'No list'}</span>
            </button>
          )}
          {onSkip && !isDraft && (
            <button type="button" className={`${pill(false)} ${hide(false)}`} title={skipLabel(todo, today)} onClick={() => { onSkip(); onClose() }}>
              <SkipForward className="w-[15px] h-[15px]" />
              <span className={`truncate ${short(false)}`}>{skipLabel(todo, today)}</span>
            </button>
          )}
          {!more && (
            <button type="button" className={`${pill(false)} md:hidden`} onClick={() => setMore(true)}>
              <Ellipsis className="w-[15px] h-[15px]" />
              <span>More</span>
            </button>
          )}
          {!isDraft && (
            <>
              <button
                type="button"
                onClick={() => { deleting.current = true; onDelete() }}
                aria-label="Delete to-do"
                className="grid shrink-0 place-items-center w-7 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.045] max-md:w-11 max-md:h-11"
              >
                <Trash2 className="w-[17px] h-[17px]" />
              </button>
            </>
          )}
        </div>
        {isTask && !isDraft && (todo.sessions?.length ?? 0) > 0 && <FocusLog sessions={todo.sessions ?? []} />}
        {isDraft && (
          // A new item is either something to do or something to show up to; it is only kept once confirmed
          // (this button, Enter, or clicking away).
          <div className="mt-2.5 flex items-center gap-2 max-md:flex-wrap">
            <div role="group" aria-label="Kind" className="inline-flex h-9 shrink-0 rounded-lg max-md:h-11 max-md:w-full bg-foreground/[0.06] p-0.5 text-[length:calc(13px*var(--ts))] font-medium max-md:text-[length:calc(15px*var(--ts))]">
              {([['To-do', false, ListChecks], ['Event', true, CalendarDays]] as const).map(([label, value, Icon]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={isEvent === value}
                  onClick={() => onPatch({ asEvent: value })}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 max-md:flex-1 max-md:px-3 ${isEvent === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon className="h-3.5 w-3.5 max-md:h-4 max-md:w-4" />{label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { deleting.current = true; onDelete() }}
              aria-label="Discard this one"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.085] hover:text-foreground max-md:h-11 max-md:w-11"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={!todo.title.trim() && !todo.notes.trim()}
              className={`${BTN_PRIMARY} min-w-0 flex-1 max-md:min-w-0 max-md:flex-1`}
            >
              <Check className="h-4 w-4" strokeWidth={3} />{isEvent ? 'Add event' : 'Add to-do'}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
