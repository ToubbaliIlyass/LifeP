'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search as SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchResult {
  id: number
  type: string
  label: string
}

const TYPE_COLORS: Record<string, string> = {
  Goal: 'text-violet-600 dark:text-violet-400',
  Habit: 'text-emerald-600 dark:text-emerald-400',
  Task: 'text-sky-600 dark:text-sky-400',
  Event: 'text-amber-600 dark:text-amber-400',
  Course: 'text-indigo-600 dark:text-indigo-400',
  Assignment: 'text-pink-600 dark:text-pink-400',
  Exam: 'text-rose-600 dark:text-rose-400',
  Note: 'text-slate-600 dark:text-slate-400',
  JournalEntry: 'text-slate-600 dark:text-slate-400',
  Concept: 'text-zinc-500 dark:text-zinc-400',
  Project: 'text-teal-600 dark:text-teal-400',
  HealthMetric: 'text-cyan-600 dark:text-cyan-400',
}

interface SearchBarProps {
  onClose: () => void
  onSelectResult?: (id: number) => void
}

/**
 * Find something and open it. Nothing else.
 *
 * An earlier version had type-filter chips, an overdue toggle and saved
 * views. It turned a box you type into to reach one thing into a query
 * builder — more to read and more to click before getting the answer. The
 * text box already narrows by type well enough ("essay", "gym"), so what
 * actually helps is being fast: results as you type, and hands never
 * leaving the keyboard.
 */
export function SearchBar({ onClose, onSelectResult }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([])
        setLoading(false)
        return
      }
      setLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then(({ results: r }: { results: SearchResult[] }) => {
          setResults(r ?? [])
          setActive(0)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }, 160)
    return () => clearTimeout(timer)
  }, [query])

  function open(result: SearchResult) {
    onSelectResult?.(result.id)
    onClose()
  }

  // Arrow keys move, Enter opens, Escape closes — handled on the input so
  // focus never has to leave it.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = results[active]
      if (chosen) open(chosen)
    }
  }

  // Keeps the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const searching = query.trim().length >= 2
  const grouped = useMemo(() => {
    // Grouping by type makes a long list scannable — "which of my three
    // things called 'essay' is the task" is answerable at a glance.
    const map = new Map<string, { result: SearchResult; index: number }[]>()
    results.forEach((result, index) => {
      const bucket = map.get(result.type) ?? []
      bucket.push({ result, index })
      map.set(result.type, bucket)
    })
    return [...map.entries()]
  }, [results])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-3" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-lg bg-popover border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-border/50">
          <SearchIcon className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search everything…"
            aria-label="Search"
            className="border-0 shadow-none focus-visible:ring-0 text-base sm:text-sm py-4 px-1 bg-transparent dark:bg-transparent"
          />
          <kbd className="hidden sm:block text-[10px] text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5 shrink-0">
            Esc
          </kbd>
        </div>

        {searching && (
          <div ref={listRef} className="max-h-[60vh] sm:max-h-80 overflow-y-auto">
            {loading && results.length === 0 && (
              <p className="text-[12px] text-muted-foreground/60 text-center py-6">Searching…</p>
            )}

            {!loading && results.length === 0 && (
              <p className="text-[12px] text-muted-foreground/60 text-center py-6">
                Nothing matches &quot;{query}&quot;
              </p>
            )}

            {grouped.map(([type, entries]) => (
              <div key={type}>
                <p className={`text-[10px] font-mono uppercase tracking-widest px-4 pt-3 pb-1 ${TYPE_COLORS[type] ?? 'text-muted-foreground/60'}`}>
                  {type}
                </p>
                {entries.map(({ result, index }) => (
                  <button
                    key={result.id}
                    data-index={index}
                    onClick={() => open(result)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex items-center gap-3 w-full text-left px-4 py-3 sm:py-2.5 transition-colors ${
                      index === active ? 'bg-muted' : 'hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-[14px] sm:text-[13px] truncate flex-1 text-foreground/85">{result.label}</span>
                    {index === active && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 hidden sm:block" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {!searching && (
          <div className="px-4 py-4">
            <p className="text-[12px] text-muted-foreground/60">
              Search across goals, tasks, habits, notes — everything.
            </p>
            <p className="hidden sm:block text-[10px] font-mono text-muted-foreground/45 mt-2">
              ↑↓ to move · ↵ to open · esc to close
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
