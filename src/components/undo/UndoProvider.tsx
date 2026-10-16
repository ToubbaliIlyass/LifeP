'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

interface UndoEntry {
  id: number
  /** What happened, in the user's words. */
  label: string
  undo: () => Promise<void> | void
}

interface UndoContextValue {
  /** Register something that just happened, and how to reverse it. */
  record: (label: string, undo: () => Promise<void> | void) => void
  undoLast: () => void
  canUndo: boolean
}

const UndoContext = createContext<UndoContextValue | null>(null)

/**
 * Entries kept for Cmd+Z. There is no pop-up offering it: undo is a key,
 * not a message after every tick.
 */
const STACK_LIMIT = 20

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext)
  // A no-op fallback keeps components usable outside the provider (tests,
  // isolated rendering) instead of throwing.
  return ctx ?? { record: () => {}, undoLast: () => {}, canUndo: false }
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<UndoEntry[]>([])
  const nextId = useRef(1)

  const record = useCallback((label: string, undo: () => Promise<void> | void) => {
    const entry = { id: nextId.current++, label, undo }
    setStack((s) => [entry, ...s].slice(0, STACK_LIMIT))
  }, [])

  const undoEntry = useCallback(async (entry: UndoEntry) => {
    try {
      await entry.undo()
    } finally {
      // Reversing it means it is no longer something that can be reversed.
      setStack((s) => s.filter((e) => e.id !== entry.id))
    }
  }, [])

  const undoLast = useCallback(() => {
    const entry = stack[0]
    if (entry) undoEntry(entry)
  }, [stack, undoEntry])

  // Cmd/Ctrl+Z anywhere except while typing, where it must keep meaning
  // "undo my typing".
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z' || e.shiftKey) return
      const el = e.target as HTMLElement
      const typing =
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      if (typing) return
      if (stack.length === 0) return
      e.preventDefault()
      undoLast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stack, undoLast])

  return (
    <UndoContext.Provider value={{ record, undoLast, canUndo: stack.length > 0 }}>
      {children}

    </UndoContext.Provider>
  )
}
