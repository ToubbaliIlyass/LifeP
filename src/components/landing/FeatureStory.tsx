'use client'

import { useEffect, useRef, useState } from 'react'
import { DayShowcase, ListShowcase, RhythmShowcase, WhiteboardShowcase } from './Showcases'
import { EASE } from './useInView'

/*
 * What Acture does, told as one scroll.
 *
 * On a wide screen the picture is pinned in a frame of fixed height on the
 * right while the four steps scroll past on the left; whichever step is in
 * the middle of the screen is the one the frame shows, and a line down the
 * left fills in as you go. Nothing changes size, so nothing below it moves.
 * On a phone there is no room to pin anything: each step is followed by its
 * own picture, which plays when it is reached.
 */
const STEPS = [
  {
    title: 'Talk, don’t type',
    text: 'Ramble at it, or hand it a photo of the whiteboard. It pulls out what needs doing and what happens at a time, and leaves the doodles alone.',
    Visual: WhiteboardShowcase,
  },
  {
    title: 'It finds the time',
    text: 'Plan my day fits your to-dos into the gaps between classes, meetings and the five prayers. A time you set yourself never gets moved.',
    Visual: DayShowcase,
  },
  {
    title: 'It learns when you actually do things',
    text: 'Planned the gym for the morning, went every evening? It noticed. And once a day it asks how things went, so tomorrow’s plan is a little less wrong.',
    Visual: RhythmShowcase,
  },
  {
    title: 'Still a really nice list',
    text: 'Inbox, Today, Upcoming, projects with headings and a progress pie. All the calm of a good to-do app, none of the forms.',
    Visual: ListShowcase,
  },
]

export function FeatureStory() {
  const [active, setActive] = useState(0)
  /** Steps whose picture has been shown at least once, so a picture plays the first time and then stays finished. */
  const [played, setPlayed] = useState<Set<number>>(() => new Set())
  const steps = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    // The step crossing the middle of the screen is the one being read.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const i = Number((e.target as HTMLElement).dataset.step)
        setActive(i)
        setPlayed((cur) => (cur.has(i) ? cur : new Set(cur).add(i)))
      }
    }, { rootMargin: '-45% 0px -45% 0px' })
    steps.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="md:grid md:grid-cols-2 md:gap-16">
      <ol className="relative">
        {/* The progress line: the steps read so far, filled. */}
        <span aria-hidden className="absolute left-[11px] top-3 bottom-3 hidden w-px bg-border md:block" />
        <span
          aria-hidden
          style={{ height: `calc(${(active / (STEPS.length - 1)) * 100}% - 24px)` }}
          className={`absolute left-[11px] top-3 hidden w-px bg-foreground transition-[height] duration-700 md:block ${EASE}`}
        />
        {STEPS.map(({ title, text, Visual }, i) => (
          <li
            key={title}
            ref={(el) => { steps.current[i] = el }}
            data-step={i}
            className="relative py-8 md:flex md:min-h-[48vh] md:items-center md:py-0 md:pl-12"
          >
            <div className={`transition-opacity duration-700 ${EASE} ${active === i ? 'md:opacity-100' : 'md:opacity-35'}`}>
              <span
                className={`hidden md:grid absolute left-0 top-1/2 -translate-y-1/2 h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular-nums ring-4 ring-background transition-colors duration-700 ${EASE} ${i <= active ? 'bg-foreground text-background' : 'bg-card text-muted-foreground ring-offset-0 outline outline-1 outline-border'}`}
              >
                {i + 1}
              </span>
              <p className="text-sm font-semibold tabular-nums text-muted-foreground md:hidden">0{i + 1}</p>
              <h3 className="mt-1 max-w-[400px] text-2xl font-bold tracking-tight md:text-3xl [text-wrap:balance]">{title}</h3>
              <p className="mt-3 max-w-[400px] text-base text-foreground/70 [text-wrap:pretty]">{text}</p>
              {/* On a phone, its picture follows it. */}
              <div className="mt-8 flex justify-center md:hidden">
                <Visual />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* The pinned frame: one height for every picture, so swapping them moves nothing. */}
      <div className="hidden md:block">
        <div className="sticky top-[calc(50vh-230px)] h-[460px]">
          {STEPS.map(({ title, Visual }, i) => (
            <div
              key={title}
              aria-hidden={active !== i}
              className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${EASE} ${active === i ? 'opacity-100 translate-y-0 blur-0' : 'pointer-events-none opacity-0 translate-y-4 blur-sm'}`}
            >
              <Visual play={played.has(i)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
