'use client'

import { Repeat } from 'lucide-react'
import { EASE, useInView } from './useInView'

/*
 * `play`, when given, decides when a picture runs — the pinned frame in
 * FeatureStory shows them one at a time, all already "in view". Without it a
 * picture runs when it scrolls into view, as on a phone.
 *
 * Four small pictures of the app doing its job, each drawn from the app's own
 * parts and set moving when it scrolls into view. Not screenshots: they stay
 * sharp at any size, follow light and dark, and say one thing each.
 */

const BOX = 'w-full max-w-[420px] rounded-2xl bg-card p-2 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_32px_rgb(0_0_0/0.06)] ring-1 ring-border'
const PANEL = 'rounded-lg bg-background p-4'
const CHECK = 'w-4 h-4 shrink-0 rounded border-2 border-muted-foreground/50'

/** 01 — A photo of a whiteboard, read: the scribbles slide out as to-dos. */
export function WhiteboardShowcase({ play }: { play?: boolean } = {}) {
  const view = useInView<HTMLDivElement>()
  const { ref } = view
  const seen = play ?? view.seen
  const lines = [
    { scrawl: 'lab report → thurs!!', todo: 'Lab report', meta: 'due Thu', hot: true },
    { scrawl: 'book flights (cheap ones)', todo: 'Book flights', meta: 'Inbox' },
    { scrawl: 'mtg w/ Sara fri 2pm', todo: 'Meeting with Sara', meta: 'Fri 14:00', event: true },
  ]
  return (
    <div ref={ref} className="relative w-full max-w-[420px]">
      {/* The photo: tilted, handwritten, a scan line passing over it. */}
      <div className={`relative mr-10 overflow-hidden rounded-xl bg-[#f7f6f1] px-6 pt-5 pb-12 shadow-[0_12px_32px_rgb(0_0_0/0.10)] ring-1 ring-black/5 transition-all duration-1000 ${EASE} ${seen ? '-rotate-2' : 'rotate-0'} dark:bg-[#272727]`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">whiteboard.jpg</p>
        <ul className="mt-3 space-y-2 text-base text-[#1d4ed8] [font-family:'Bradley_Hand','Segoe_Print','Comic_Sans_MS',cursive] dark:text-sky-300">
          {lines.map((l) => <li key={l.scrawl}>{l.scrawl}</li>)}
        </ul>
        <span aria-hidden className={`pointer-events-none absolute inset-x-0 h-12 bg-primary/20 blur-md transition-all duration-[2400ms] ${EASE} ${seen ? 'top-full' : '-top-12'}`} />
      </div>
      {/* What came out of it. */}
      <div className={`${BOX} relative -mt-8 ml-auto max-w-[320px] transition-all duration-1000 delay-700 ${EASE} ${seen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
        <ul className={`${PANEL} space-y-2 text-sm`}>
          {lines.map((l, i) => (
            <li key={l.todo} style={{ transitionDelay: `${1100 + i * 250}ms` }} className={`flex items-center gap-2 transition-all duration-700 ${EASE} ${seen ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'}`}>
              {l.event ? <span className="w-1 h-4 shrink-0 rounded-full bg-sky-500/70" /> : <span className={CHECK} />}
              {l.hot && <span className="font-bold text-red-500">!!</span>}
              <span>{l.todo}</span>
              <span className="ml-auto rounded bg-foreground/5 px-2 text-xs font-medium text-muted-foreground tabular-nums">{l.meta}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** 02 — A day filling itself in: fixed things stay put, to-dos drop into the gaps. */
export function DayShowcase({ play }: { play?: boolean } = {}) {
  const view = useInView<HTMLDivElement>()
  const { ref } = view
  const seen = play ?? view.seen
  const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17]
  const top = (h: number) => `${((h - 9) / 8) * 100}%`
  const span = (a: number, b: number) => ({ top: top(a), height: `calc(${((b - a) / 8) * 100}% - 4px)` })
  const fixed = [
    { label: 'Compilers lecture', from: 10, to: 11.5 },
    { label: 'Dentist', from: 15, to: 16 },
  ]
  const placed = [
    { label: 'Review ML notes', from: 9, to: 9.75 },
    { label: 'Lab report', from: 12, to: 13.5 },
    { label: 'Call the bank', from: 13.5, to: 14.25 },
    { label: 'Gym', from: 16.5, to: 17.5 },
  ]
  return (
    <div ref={ref} className={BOX}>
      <div className={PANEL}>
        <div className="flex items-baseline justify-between">
          <p className="text-lg font-bold tracking-tight">Thursday</p>
          <p className={`text-xs font-medium text-muted-foreground transition-opacity duration-700 delay-[1800ms] ${seen ? 'opacity-100' : 'opacity-0'}`}>Planned 4 · nothing moved</p>
        </div>
        <div className="relative mt-4 ml-10 h-72">
          {HOURS.map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-border" style={{ top: top(h) }}>
              <span className="absolute -left-10 -top-2 text-xs tabular-nums text-muted-foreground">{h}:00</span>
            </div>
          ))}
          {/* Asr, as a thin mark: the planner keeps it free. */}
          <div className="absolute inset-x-0 border-t-2 border-dashed border-emerald-500/60" style={{ top: top(16.33) }}>
            <span className="absolute right-0 -top-5 text-xs font-medium text-emerald-600 dark:text-emerald-400">Asr</span>
          </div>
          {fixed.map((f) => (
            <div key={f.label} style={span(f.from, f.to)} className="absolute left-0 right-[36%] mt-0.5 overflow-hidden rounded-md bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-500/30 dark:text-sky-300">
              {f.label}
            </div>
          ))}
          {placed.map((p, i) => (
            <div
              key={p.label}
              style={{ ...span(p.from, p.to), transitionDelay: `${300 + i * 300}ms` }}
              className={`absolute left-1/3 right-0 mt-0.5 overflow-hidden rounded-md bg-amber-400/25 px-2 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-amber-500/35 transition-all duration-1000 dark:text-amber-100 ${EASE} ${seen ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'}`}
            >
              {p.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 03 — Plan and reality: the gym was planned for the morning and kept happening at seven, so the plan moved. */
export function RhythmShowcase({ play }: { play?: boolean } = {}) {
  const view = useInView<HTMLDivElement>()
  const { ref } = view
  const seen = play ?? view.seen
  // Minutes past 6:00 when the gym actually happened, Monday to Sunday.
  const done = [790, 805, 770, 800, 785, 815, 795]
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const y = (m: number) => 10 + ((m - 360) / (1320 - 360)) * 180
  return (
    <div ref={ref} className={BOX}>
      <div className={PANEL}>
        <p className="text-sm font-semibold">Gym, last week</p>
        <svg viewBox="0 0 300 210" className="mt-3 w-full" role="img" aria-label="Planned for 7am every day, done around 7pm every day">
          {[420, 720, 1140].map((m) => (
            <g key={m}>
              <line x1="34" x2="300" y1={y(m)} y2={y(m)} className="stroke-border" strokeWidth="1" />
              <text x="0" y={y(m) + 4} className="fill-muted-foreground text-[10px]">{m === 420 ? '7am' : m === 720 ? 'noon' : '7pm'}</text>
            </g>
          ))}
          {/* Where it was planned. */}
          <line x1="40" x2="295" y1={y(420)} y2={y(420)} className="stroke-muted-foreground/60" strokeWidth="2" strokeDasharray="4 5" />
          {/* Where it really happened. */}
          {done.map((m, i) => (
            <g key={i}>
              <circle
                cx={50 + i * 40} cy={y(m + 360)} r="6"
                style={{ transitionDelay: `${i * 140}ms` }}
                className={`fill-primary transition-all duration-700 ${EASE} ${seen ? 'opacity-100' : 'opacity-0'}`}
              />
              <text x={50 + i * 40} y="206" textAnchor="middle" className="fill-muted-foreground text-[10px]">{days[i]}</text>
            </g>
          ))}
          {/* So the plan follows. */}
          <path
            d={`M 40 ${y(420)} C 150 ${y(420)}, 160 ${y(1150)}, 295 ${y(1150)}`}
            fill="none" strokeWidth="2.5" strokeLinecap="round" pathLength={1}
            strokeDasharray="1" style={{ strokeDashoffset: seen ? 0 : 1, transitionDelay: '1100ms' }}
            className={`stroke-primary transition-[stroke-dashoffset] duration-[1600ms] ${EASE}`}
          />
        </svg>
        <p className={`mt-2 text-sm text-foreground/80 transition-opacity duration-700 delay-[2400ms] ${seen ? 'opacity-100' : 'opacity-0'}`}>
          Planned at <s className="text-muted-foreground">7:00</s> <b className="font-semibold">19:15</b> from now on.
        </p>
      </div>
    </div>
  )
}

/** 04 — The list itself: a project with headings and a progress pie, as calm as the app is. */
export function ListShowcase({ play }: { play?: boolean } = {}) {
  const view = useInView<HTMLDivElement>()
  const { ref } = view
  const seen = play ?? view.seen
  const sections: { heading: string | null; items: [string, boolean][] }[] = [
    { heading: null, items: [['Pick a title', true], ['Outline the three parts', true]] },
    { heading: 'Slides', items: [['Simplify the layouts', true], ['Add the results chart', false]] },
    { heading: 'Practice', items: [['Run it with Eric', false], ['Time a full rehearsal', false]] },
  ]
  const doneCount = sections.flatMap((s) => s.items).filter(([, d]) => d).length
  return (
    <div ref={ref} className={BOX}>
      <div className={PANEL}>
        <p className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <svg viewBox="0 0 16 16" className="h-5 w-5 text-primary" aria-hidden fill="none" stroke="currentColor">
            <circle cx="8" cy="8" r="7" strokeWidth="1.4" />
            <circle cx="8" cy="8" r="2.75" strokeWidth="5.5" strokeDasharray={`${seen ? (doneCount / 6) * 17.28 : 0} 17.28`} transform="rotate(-90 8 8)" className={`transition-[stroke-dasharray] duration-[1400ms] ${EASE}`} />
          </svg>
          Thesis defence
        </p>
        <p className="mt-1 text-sm text-foreground/70">Three things the room should remember. Nothing else.</p>
        {sections.map((s, si) => (
          <div key={si}>
            {s.heading && <p className="mt-4 border-b border-border pb-1 text-sm font-bold text-primary">{s.heading}</p>}
            <ul className="mt-1">
              {s.items.map(([label, done], i) => (
                <li key={label} className="flex items-center gap-2 py-1 text-sm">
                  <span
                    style={{ transitionDelay: `${400 + (si * 2 + i) * 200}ms` }}
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border-2 transition-colors duration-500 ${done && seen ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50 text-transparent'}`}
                  >
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="m2.5 6.5 2.5 2.5 4.5-6" /></svg>
                  </span>
                  <span className={`transition-colors duration-500 ${done && seen ? 'text-muted-foreground line-through' : ''}`} style={{ transitionDelay: `${400 + (si * 2 + i) * 200}ms` }}>{label}</span>
                  {label === 'Run it with Eric' && <Repeat className="ml-1 h-3 w-3 text-muted-foreground" aria-label="Repeats" />}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
