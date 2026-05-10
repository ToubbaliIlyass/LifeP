'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

interface SearchResult {
  id: number
  type: string
  label: string
}

const TYPE_COLORS: Record<string, string> = {
  Goal: 'text-violet-600', Habit: 'text-emerald-600', Task: 'text-sky-600',
  Event: 'text-amber-600', Course: 'text-indigo-600', Assignment: 'text-pink-600',
  Exam: 'text-rose-600', Note: 'text-slate-600', JournalEntry: 'text-slate-600',
  Concept: 'text-zinc-500', Project: 'text-teal-600',
}

interface SearchBarProps {
  onClose: () => void
}

export function SearchBar({ onClose }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length < 2) {
        setResults([])
        setLoading(false)
        return
      }
      setLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then(({ results: r }: { results: SearchResult[] }) => { setResults(r); setLoading(false) })
        .catch(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-background border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 border-b">
          <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your graph…"
            className="border-0 shadow-none focus-visible:ring-0 text-sm py-4 px-3"
          />
          <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {query.length >= 2 && (
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <p className="text-xs text-muted-foreground text-center py-4">Searching…</p>
            )}
            {!loading && results.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No results for &quot;{query}&quot;</p>
            )}
            {!loading && results.length > 0 && (
              <div className="p-2">
                {results.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted cursor-default">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide w-16 shrink-0 ${TYPE_COLORS[r.type] ?? 'text-muted-foreground'}`}>
                      {r.type}
                    </span>
                    <span className="text-sm truncate">{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!query && (
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Type to search nodes, habits, tasks, notes…</p>
          </div>
        )}
      </div>
    </div>
  )
}
