'use client'

import { useEffect, useState } from 'react'
import { Mic, Moon, Repeat, Star } from 'lucide-react'

/** What is said into the demo, a word at a time, and what it turns into. */
const SAID = 'dentist friday at 3, review ML every day until wednesday, and remind me to call mom tonight'

/**
 * The app, doing the one thing it is for: a rambled sentence in, a day out.
 *
 * Drawn from the app's own parts — the bottom bar, square checkboxes, the
 * grey event box — rather than a screenshot, so it stays sharp and true to
 * the real thing. Loops; holds still for anyone who asked for less motion.
 */
export function HeroDemo() {
  const words = SAID.split(' ')
  const [shown, setShown] = useState(0)
  const [rows, setRows] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // The finished picture, once, instead of the loop.
      const id = setTimeout(() => { setShown(words.length); setRows(3) }, 0)
      return () => clearTimeout(id)
    }
    let step = 0
    const total = words.length + 3 + 12
    const id = setInterval(() => {
      step = (step + 1) % total
      setShown(Math.min(step, words.length))
      setRows(Math.max(0, Math.min(3, step - words.length)))
    }, 160)
    return () => clearInterval(id)
  }, [words.length])

  const listening = shown < words.length
  // Fade in place: every row's space is there from the start, so the page
  // never moves under someone reading it.
  const appear = (i: number) => `transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${rows > i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`
  const box = 'w-4 h-4 shrink-0 rounded border-2 border-muted-foreground/45'

  return (
    <div className="w-full max-w-[480px] rounded-2xl border border-border bg-card p-2 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_32px_rgb(0_0_0/0.06)]">
      <div className="rounded-lg bg-background px-5 pt-5 pb-3">
        <p className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Star className="w-5 h-5 text-amber-400 fill-amber-400" aria-hidden />Today
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">Thursday, 15 October</p>
        <div className={appear(0)}>
          <p className="mt-3 flex items-center gap-2 rounded-md bg-foreground/[0.05] px-3 py-1.5 text-sm">
            <span className="w-1 h-3 rounded-full bg-sky-500/70" />
            <span className="font-medium tabular-nums text-sky-700 dark:text-sky-400">Fri 15:00</span>Dentist
          </p>
        </div>
        <ul className="mt-2 text-sm">
          <li className="flex items-center gap-2 py-1.5">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded border-2 border-primary bg-primary text-primary-foreground">
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="m2.5 6.5 2.5 2.5 4.5-6" /></svg>
            </span>
            <span className="text-muted-foreground line-through">Reply to Hana</span>
          </li>
          <li className="flex items-center gap-2 py-1.5"><span className={box} />Water the plants</li>
          <li className={appear(1)}>
            <span className="flex items-center gap-2 py-1.5">
              <span className={box} />Review ML
              <Repeat className="w-3 h-3 text-muted-foreground" aria-label="Repeats" />
              <span className="ml-auto text-xs font-medium text-amber-600">until Wed</span>
            </span>
          </li>
          <li className={appear(2)}>
            <span className="flex items-center gap-2 py-1.5">
              <span className={box} />
              <Moon className="w-3 h-3 text-indigo-500" aria-label="This evening" />Call mom
            </span>
          </li>
        </ul>
      </div>
      {/* The bottom bar, as in the app: the mic lights while it listens. */}
      <div className="flex items-start gap-3 px-3 py-3">
        <span className={`grid place-items-center w-6 h-6 shrink-0 rounded-full transition-colors duration-300 ${listening && shown > 0 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
          <Mic className="w-3.5 h-3.5" />
        </span>
        <p className="h-18 text-sm leading-6 text-foreground/80">
          {shown === 0 ? <span className="text-muted-foreground">Say or type what needs to happen</span> : <>“{words.slice(0, shown).join(' ')}{listening ? '' : '”'}</>}
        </p>
      </div>
    </div>
  )
}
