'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

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

export function NotesPanel() {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch('/api/notes')
      .then((r) => r.json())
      .then(({ notes: n }: { notes: NoteRow[] }) => { setNotes(n); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        {loading && <p className="text-sm text-muted-foreground text-center pt-8">Loading…</p>}
        {!loading && notes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8 px-4">
            No notes yet — tell the AI something you want to remember, or ask it to record a journal entry.
          </p>
        )}
        {!loading && notes.length > 0 && (
          <div className="p-3 space-y-2">
            {notes.map((note) => {
              const isOpen = expanded.has(note.id)
              return (
                <button
                  key={note.id}
                  onClick={() => toggleExpand(note.id)}
                  className="w-full text-left border rounded-xl overflow-hidden hover:bg-muted/30 transition-colors"
                >
                  <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {note.type === 'journal' ? 'Journal' : 'Note'}
                        </span>
                        {note.mood && (
                          <span className="text-sm">{MOOD_EMOJI[note.mood] ?? note.mood}</span>
                        )}
                      </div>
                      <p className="text-[13px] font-serif truncate mt-0.5">{note.title}</p>
                      {!isOpen && note.content && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{note.content}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && note.content && (
                    <div className="px-3 pb-3 pt-0">
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed border-t pt-2">{note.content}</p>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
