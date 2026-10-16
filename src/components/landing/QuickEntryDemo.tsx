'use client'

import { useMemo, useState } from 'react'
import { parseEntry } from '@/lib/quick-entry'
import { todayStr } from '@/lib/date'

/**
 * The quick entry syntax, live: the same reader the app uses, so whatever a
 * visitor types here is exactly what Acture would make of it.
 */
export function QuickEntryDemo() {
  const [text, setText] = useState('review ML do tomorrow due fri for 45m #school !! every day x3')
  const entry = useMemo(() => parseEntry(text, todayStr()), [text])
  return (
    <div className="w-full max-w-[560px] rounded-2xl border border-border bg-card p-2">
      <label className="block rounded-lg bg-background px-4 py-3">
        <span className="sr-only">Type a to-do</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="w-full bg-transparent text-base font-medium outline-none"
        />
        <span className="mt-2 flex flex-wrap items-center gap-1 text-xs" aria-live="polite">
          {entry?.title && <span className="mr-1 font-medium text-foreground/80">“{entry.title}”</span>}
          {entry?.pieces.map((p) => (
            <span key={p} className="rounded bg-primary/15 px-2 py-0.5 font-medium text-primary">{p}</span>
          ))}
        </span>
      </label>
    </div>
  )
}
