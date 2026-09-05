'use client'

import { useEffect, useRef, useState } from 'react'
import { Bookmark, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchResult {
  id: number
  type: string
  label: string
}

interface SavedView {
  id: number
  name: string
  query: { q?: string; types?: string[]; overdue?: boolean }
}

const TYPE_COLORS: Record<string, string> = {
  Goal: 'text-violet-600', Habit: 'text-emerald-600', Task: 'text-sky-600',
  Event: 'text-amber-600', Course: 'text-indigo-600', Assignment: 'text-pink-600',
  Exam: 'text-rose-600', Note: 'text-slate-600', JournalEntry: 'text-slate-600',
  Concept: 'text-zinc-500', Project: 'text-teal-600',
  HealthMetric: 'text-cyan-600',
}

const FILTERABLE_TYPES = ['Goal', 'Habit', 'Task', 'Event', 'Note', 'Course', 'Project', 'HealthMetric']

interface SearchBarProps {
  onClose: () => void
  onSelectResult?: (id: number) => void
}

export function SearchBar({ onClose, onSelectResult }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set())
  const [overdueOn, setOverdueOn] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasFilter = query.length >= 2 || overdueOn

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    fetch('/api/saved-views')
      .then((r) => r.json())
      .then(({ views }: { views: SavedView[] }) => setSavedViews(views))
      .catch(() => {})
  }, [])

  function toggleType(type: string) {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type); else next.add(type)
      return next
    })
  }

  function applyView(view: SavedView) {
    setQuery(view.query.q ?? '')
    setActiveTypes(new Set(view.query.types ?? []))
    setOverdueOn(!!view.query.overdue)
  }

  async function saveCurrentSearch() {
    const name = window.prompt('Name this view:', overdueOn ? 'Overdue' : query)
    if (!name?.trim()) return
    setSaving(true)
    const res = await fetch('/api/saved-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        query: { q: query || undefined, types: activeTypes.size > 0 ? [...activeTypes] : undefined, overdue: overdueOn || undefined },
      }),
    })
    const data = await res.json() as { view: SavedView }
    setSavedViews((prev) => [...prev, data.view])
    setSaving(false)
  }

  async function deleteView(id: number) {
    setSavedViews((prev) => prev.filter((v) => v.id !== id))
    await fetch(`/api/saved-views?id=${id}`, { method: 'DELETE' })
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasFilter) {
        setResults([])
        setLoading(false)
        return
      }
      setLoading(true)
      const params = new URLSearchParams()
      if (query.length >= 2) params.set('q', query)
      if (activeTypes.size > 0) params.set('type', [...activeTypes].join(','))
      if (overdueOn) params.set('overdue', 'true')
      fetch(`/api/search?${params.toString()}`)
        .then((r) => r.json())
        .then(({ results: r }: { results: SearchResult[] }) => { setResults(r); setLoading(false) })
        .catch(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, activeTypes, overdueOn, hasFilter])

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
            className="border-0 shadow-none focus-visible:ring-0 text-sm py-4 px-3 bg-transparent dark:bg-transparent"
          />
          <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-2 border-b overflow-x-auto">
          <button
            onClick={() => setOverdueOn((o) => !o)}
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border transition-colors ${
              overdueOn
                ? 'bg-red-500/15 border-red-400/40 text-red-500'
                : 'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
            }`}
          >
            Overdue
          </button>
          {FILTERABLE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border transition-colors ${
                activeTypes.has(type)
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {type}
            </button>
          ))}
          {hasFilter && (
            <button
              onClick={saveCurrentSearch}
              disabled={saving}
              className="shrink-0 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors ml-auto disabled:opacity-50"
              title="Save this search as a view"
            >
              <Bookmark className="w-2.5 h-2.5" /> Save
            </button>
          )}
        </div>

        {hasFilter && (
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <p className="text-xs text-muted-foreground text-center py-4">Searching…</p>
            )}
            {!loading && results.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No results{query ? ` for "${query}"` : ''}</p>
            )}
            {!loading && results.length > 0 && (
              <div className="p-2">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { onSelectResult?.(r.id); onClose() }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors w-full text-left"
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide w-16 shrink-0 ${TYPE_COLORS[r.type] ?? 'text-muted-foreground'}`}>
                      {r.type}
                    </span>
                    <span className="text-sm truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!hasFilter && (
          <div className="px-4 py-3">
            {savedViews.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {savedViews.map((v) => (
                  <div key={v.id} className="group flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full border border-border/50 bg-muted/20">
                    <button onClick={() => applyView(v)} className="text-xs text-foreground/80 hover:text-foreground transition-colors">
                      {v.name}
                    </button>
                    <button
                      onClick={() => deleteView(v.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full text-muted-foreground/50 hover:text-destructive transition-all"
                      title="Delete view"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Type to search nodes, habits, tasks, notes…</p>
          </div>
        )}
      </div>
    </div>
  )
}
