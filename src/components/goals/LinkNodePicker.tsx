'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Result {
  id: number
  type: string
  label: string
}

const RELATIONSHIPS = ['supports', 'part-of', 'related-to', 'about', 'blocks', 'leads-to', 'depends-on']

/**
 * Search for an existing node and attach it to something.
 *
 * The relationship type is the user's choice rather than inferred: edge types
 * are open-ended in this graph, and guessing one would quietly encode a
 * meaning the user did not intend.
 */
export function LinkNodePicker({
  targetId,
  excludeIds,
  onClose,
  onLinked,
}: {
  targetId: number
  excludeIds: number[]
  onClose: () => void
  onLinked: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [relationship, setRelationship] = useState('supports')
  const [linking, setLinking] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setResults([]); return }
      setLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then(({ results: r }: { results: Result[] }) => {
          setResults((r ?? []).filter((x) => x.id !== targetId && !excludeIds.includes(x.id)))
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, targetId, excludeIds])

  async function link(node: Result) {
    setLinking(node.id)
    setError(null)
    // The linked node points at the goal, matching how "supports" and
    // "part-of" already read elsewhere in the graph: habit → goal.
    const res = await fetch('/api/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: node.id, targetId, type: relationship }),
    })
    setLinking(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Could not link' }))
      setError(data.error ?? 'Could not link')
      return
    }
    onLinked()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-10 w-full max-w-md mx-4 bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <p className="text-[13px] font-semibold">Link something to this goal</p>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border/40">
          <label className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-1.5 block">
            Relationship
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RELATIONSHIPS.map((r) => (
              <button
                key={r}
                onClick={() => setRelationship(r)}
                className={`text-[11px] font-mono px-2 py-1 rounded-full border transition-colors ${
                  relationship === r
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-border/40">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a task, habit, note…"
            className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="max-h-64 overflow-y-auto p-2">
          {loading && <p className="text-xs text-muted-foreground text-center py-4">Searching…</p>}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nothing matching &quot;{query}&quot;</p>
          )}
          {!loading && query.trim().length < 2 && (
            <p className="text-xs text-muted-foreground text-center py-4">Type at least two characters</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => link(r)}
              disabled={linking !== null}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors w-full text-left disabled:opacity-50"
            >
              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/60 w-20 shrink-0">
                {r.type}
              </span>
              <span className="text-sm truncate flex-1">{r.label}</span>
              {linking === r.id && <span className="text-[10px] font-mono text-muted-foreground">linking…</span>}
            </button>
          ))}
        </div>

        {error && <p className="px-4 pb-3 text-[12px] text-destructive">{error}</p>}
      </div>
    </div>
  )
}
