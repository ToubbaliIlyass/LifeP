'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A line said big, lit one word at a time as it scrolls up the page.
 *
 * Each word is watched on its own: it lights when it crosses a line a little
 * above the middle of the screen, so the sentence reads itself in order as
 * the page moves rather than switching on all at once.
 */
export function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [lit, setLit] = useState<Set<number>>(() => new Set())

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const words = [...el.querySelectorAll<HTMLElement>('[data-word]')]
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLit(new Set(words.map((_, i) => i)))
      return
    }
    const io = new IntersectionObserver((entries) => {
      setLit((cur) => {
        const next = new Set(cur)
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.word)
          // Lit once it is above the line; dim again only if scrolled back below it.
          if (e.isIntersecting || e.boundingClientRect.top < 0) next.add(i)
          else next.delete(i)
        }
        return next
      })
    }, { rootMargin: '0px 0px -42% 0px' })
    words.forEach((w) => io.observe(w))
    return () => io.disconnect()
  }, [])

  let n = 0
  return (
    <p ref={ref} className="max-w-[680px] text-3xl md:text-5xl font-semibold tracking-tight [text-wrap:balance]">
      {lines.map((line, li) => (
        <span key={li} className="block">
          {line.split(' ').map((word) => {
            const i = n++
            return (
              <span
                key={i}
                data-word={i}
                className={`transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${lit.has(i) ? 'text-foreground' : 'text-foreground/25'}`}
              >
                {word}{' '}
              </span>
            )
          })}
        </span>
      ))}
    </p>
  )
}
