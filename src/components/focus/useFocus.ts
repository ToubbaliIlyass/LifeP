'use client'

import { useCallback, useMemo } from 'react'
import { useTodos } from '@/components/todos/TodosProvider'
import { isRunning, pauseFocus, startFocus } from '@/lib/focus'
import type { Todo } from '@/lib/todos'

/** Tells the focus screen (FocusHost) to open on this to-do. */
export const FOCUS_OPEN = 'acture:focus-open'

/** What the screen can do with a to-do's focus time. Times are the device's clock, written with the to-do. */
export function useFocus() {
  const { todos, patch, toggle } = useTodos()

  /** The one to-do being timed, if any: only one runs at a time. */
  const running = useMemo(() => todos.find((t) => !t.done && isRunning(t.sessions ?? [])) ?? null, [todos])

  const open = useCallback((id: number) => window.dispatchEvent(new CustomEvent(FOCUS_OPEN, { detail: id })), [])

  /** Starts or resumes. Whatever else was running is paused first. */
  const start = useCallback((todo: Todo) => {
    const now = new Date().toISOString()
    for (const t of todos) {
      if (t.id !== todo.id && isRunning(t.sessions ?? [])) patch(t.id, { sessions: pauseFocus(t.sessions ?? [], now) })
    }
    patch(todo.id, { sessions: startFocus(todo.sessions ?? [], now) })
  }, [todos, patch])

  const pause = useCallback((todo: Todo) => {
    patch(todo.id, { sessions: pauseFocus(todo.sessions ?? [], new Date().toISOString()) })
  }, [patch])

  /** Ticks it done, which ends the stretch that was running. */
  const finish = useCallback((todo: Todo) => {
    patch(todo.id, { sessions: pauseFocus(todo.sessions ?? [], new Date().toISOString()) })
    toggle(todo)
  }, [patch, toggle])

  return { running, open, start, pause, finish }
}
