'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pencil } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'

interface NoteRow {
  id: number
  type: 'note' | 'journal'
  title: string
  content: string
  mood?: string | null
  createdAt: string
}

const MOOD_EMOJI: Record<string, string> = {
  great: '😄', good: '🙂', okay: '😐', bad: '😕', awful: '😞',
}

function getWeekStart(iso: string): string {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(today.getDate() - today.getDay())
  if (d.getTime() === thisWeekStart.getTime()) return 'This week'
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  if (d.getTime() === lastWeekStart.getTime()) return 'Last week'
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function groupByWeek(notes: NoteRow[]): Map<string, NoteRow[]> {
  const map = new Map<string, NoteRow[]>()
  for (const note of notes) {
    const key = getWeekStart(note.createdAt)
    const group = map.get(key) ?? []
    group.push(note)
    map.set(key, group)
  }
  return map
}

export function NotesPanel() {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [selectedId, setSelectedId] = useState<number | null>(null)

  function load() {
    fetch('/api/notes')
      .then((r) => r.json())
      .then(({ notes: n }: { notes: NoteRow[] }) => { setNotes(n); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const grouped = groupByWeek(notes)

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); setSelectedId(null) }}
        />
      )}
      <ScrollArea className="flex-1">
        {loading && <p className="text-[12px] text-muted-foreground/50 text-center pt-8 font-mono">loading…</p>}
        {!loading && notes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8 px-4">
            No notes yet — tell the AI something you want to remember, or ask it to record a journal entry.
          </p>
        )}
        {!loading && notes.length > 0 && (
          <div className="p-4 space-y-1">
            {[...grouped.entries()].map(([weekStart, weekNotes], index) => (
              <div key={weekStart}>
                {index > 0 && <div className="pt-4" />}
                <div className="border-l-2 border-border/30 pl-3">
                  <p className="text-[11px] font-medium uppercase tracking-widest mb-2 text-muted-foreground/50">
                    {formatWeekLabel(weekStart)}
                    <span className="font-mono font-normal ml-1.5 opacity-60 text-[10px]">· {weekNotes.length}</span>
                  </p>
                  <div className="space-y-1.5">
                    {weekNotes.map((note) => {
                      const isOpen = expanded.has(note.id)
                      return (
                        <div
                          key={note.id}
                          className="group w-full text-left border border-border/40 rounded-xl overflow-hidden hover:bg-muted/30 transition-colors"
                        >
                          <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                            <button
                              onClick={() => toggleExpand(note.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono font-medium uppercase tracking-widest text-muted-foreground/50">
                                  {note.type === 'journal' ? 'Journal' : 'Note'}
                                </span>
                                {note.mood && (
                                  <span className="text-sm">{MOOD_EMOJI[note.mood] ?? note.mood}</span>
                                )}
                              </div>
                              <p className="text-[13px] font-serif truncate mt-0.5 text-foreground/85">{note.title}</p>
                              {!isOpen && note.content && (
                                <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-1">{note.content}</p>
                              )}
                            </button>
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                              <button
                                onClick={() => setSelectedId(note.id)}
                                className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all"
                                title="View / edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => toggleExpand(note.id)}
                                className="text-[10px] text-muted-foreground/40 w-4 text-center"
                              >
                                {isOpen ? '▲' : '▼'}
                              </button>
                            </div>
                          </div>
                          {isOpen && note.content && (
                            <div className="px-3 pb-3 pt-0">
                              <p className="text-[13px] font-serif text-foreground/80 whitespace-pre-wrap leading-relaxed border-t border-border/40 pt-2">{note.content}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
