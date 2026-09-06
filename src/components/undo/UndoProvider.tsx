'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Undo2, X } from 'lucide-react'

interface UndoEntry {
  id: number
  /** Shown in the toast — say what happened, in the user's words. */
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

/** How long the toast stays before fading, in ms. */
const VISIBLE_MS = 9000
/** Entries kept for Cmd+Z after their toast has gone. */
const STACK_LIMIT = 20

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext)
  // A no-op fallback keeps components usable outside the provider (tests,
  // isolated rendering) instead of throwing.
  return ctx ?? { record: () => {}, undoLast: () => {}, canUndo: false }
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<UndoEntry[]>([])
  const [toast, setToast] = useState<UndoEntry | null>(null)
  const [running, setRunning] = useState(false)
  const nextId = useRef(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const record = useCallback((label: string, undo: () => Promise<void> | void) => {
    const entry = { id: nextId.current++, label, undo }
    setStack((s) => [entry, ...s].slice(0, STACK_LIMIT))
    setToast(entry)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS)
  }, [])

  const undoEntry = useCallback(async (entry: UndoEntry) => {
    setRunning(true)
    try {
      await entry.undo()
    } finally {
      setRunning(false)
      // Reversing it means it is no longer something that can be reversed.
      setStack((s) => s.filter((e) => e.id !== entry.id))
      setToast((t) => (t?.id === entry.id ? null : t))
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

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <UndoContext.Provider value={{ record, undoLast, canUndo: stack.length > 0 }}>
      {children}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-xl border border-border/60 bg-card shadow-2xl max-w-[calc(100vw-2rem)]"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        >
          <span className="text-[13px] text-foreground/85 truncate">{toast.label}</span>
          <button
            onClick={() => undoEntry(toast)}
            disabled={running}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
            {running ? 'Undoing…' : 'Undo'}
          </button>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="p-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </UndoContext.Provider>
  )
}
