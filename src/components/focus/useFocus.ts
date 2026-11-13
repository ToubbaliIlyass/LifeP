'use client'

import { useCallback, useMemo } from 'react'
import { useTodos } from '@/components/todos/TodosProvider'
import { isRunning } from '@/lib/focus'
import type { Todo } from '@/lib/todos'

/** Tells the focus screen (FocusHost) to open on this to-do. */
export const FOCUS_OPEN = 'acture:focus-open'

/** What the screen can do with a to-do's focus time. The server keeps the moments, at its own clock. */
export function useFocus() {
  const { todos, toggle, focusAction } = useTodos()

  /** The one to-do being timed, if any: only one runs at a time. */
  const running = useMemo(() => todos.find((t) => !t.done && isRunning(t.sessions ?? [])) ?? null, [todos])

  const open = useCallback((id: number) => window.dispatchEvent(new CustomEvent(FOCUS_OPEN, { detail: id })), [])

  /** Starts or resumes. Whatever else was running is paused with it. */
  const start = useCallback((todo: Todo) => focusAction(todo, 'start'), [focusAction])

  const pause = useCallback((todo: Todo) => focusAction(todo, 'pause'), [focusAction])

  /** Ticks it done, which ends the stretch that was running. */
  const finish = useCallback((todo: Todo) => {
    focusAction(todo, 'pause')
    toggle(todo)
  }, [focusAction, toggle])

  return { running, open, start, pause, finish }
}
