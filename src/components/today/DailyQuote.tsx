'use client'

import { useMemo } from 'react'
import { todayStr } from '@/lib/date'
import { quoteFor } from '@/lib/quotes'

/**
 * A line at the foot of the day.
 *
 * Last thing on the page and deliberately quiet — it is the reward for
 * reaching the bottom, not something competing with the work above it.
 */
export function DailyQuote() {
  // Computed from the date, so it holds still all day and is the same in
  // every tab. See src/lib/quotes.ts.
  const quote = useMemo(() => quoteFor(todayStr()), [])

  return (
    <figure className="mt-10 mb-2 pt-6 border-t border-border/30">
      <blockquote className="text-[13px] font-serif italic text-muted-foreground/60 leading-relaxed max-w-[52ch]">
        {quote.text}
      </blockquote>
      {quote.author && (
        <figcaption className="text-[10px] font-mono text-muted-foreground/40 mt-1.5">
          {quote.author}
        </figcaption>
      )}
    </figure>
  )
}
