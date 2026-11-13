'use client'

import { useEffect, useState } from 'react'
import { Presence } from '@/components/ui/Presence'
import { useTodos } from '@/components/todos/TodosProvider'
import { FOCUS_OPEN, useFocus } from './useFocus'
import { FocusScreen } from './FocusScreen'

/** Owns the focus screen: opens it when asked (FOCUS_OPEN), from the editor or the strip on a list. */
export function FocusHost() {
  const { todos } = useTodos()
  const { start, pause, finish } = useFocus()
  const [openId, setOpenId] = useState<number | null>(null)
  const [last, setLast] = useState<number | null>(null)

  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent<number>).detail; setOpenId(id); setLast(id) }
    window.addEventListener(FOCUS_OPEN, on)
    return () => window.removeEventListener(FOCUS_OPEN, on)
  }, [])

  const todo = todos.find((t) => t.id === (openId ?? last)) ?? null
  const close = () => setOpenId(null)
  return (
    <Presence show={openId !== null && !!todo} exitMs={180}>
      {(state) => todo && (
        <FocusScreen
          todo={todo}
          leaving={state === 'closed'}
          onPause={() => pause(todo)}
          onResume={() => start(todo)}
          onFinish={() => { finish(todo); close() }}
          onClose={close}
        />
      )}
    </Presence>
  )
}
