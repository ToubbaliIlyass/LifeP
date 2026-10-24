'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import type { Rhythm } from '@/lib/rhythm'
import { clockZone } from '@/lib/wallclock'

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
/** Plan and reality closer than this are the same time. */
const NEAR_MINUTES = 30

/**
 * When a repeating to-do really gets done, in its editor.
 *
 * Two weeks of ticks as dots, where it was planned as a dashed line, and the
 * time it usually happens — the one the planner now places it at (see
 * src/lib/rhythm.ts). Nothing to fill in: it is drawn from ticking things off
 * and from what is said in the evening check-in.
 */
export function RhythmCard({ id, kind, done, time, onPlanAt }: {
  id: number
  kind: 'Task' | 'Habit'
  /** Re-read when it is ticked, so the dot appears. */
  done: boolean
  /** The time it has on its day, if any. */
  time: string | null
  /** Moves it to its usual time — tasks only; a habit's plan follows by itself. */
  onPlanAt?: (time: string) => void
}) {
  const [rhythm, setRhythm] = useState<Rhythm | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    const tz = clockZone() ?? ''
    // A beat after a tick, so the write it sent has landed.
    const timer = setTimeout(() => {
      fetch(`/api/todos/${id}/rhythm${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Rhythm | null) => { if (d) setRhythm(d) })
        .catch(() => {})
    }, 400)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [id, done])

  if (!rhythm) return null

  if (rhythm.doneDays === 0) {
    return (
      <p className="flex items-start gap-2 mt-3 text-[12.5px] leading-snug text-muted-foreground">
        <Clock className="w-3.5 h-3.5 mt-[1px] shrink-0" />
        Tick it off when you actually do it. After a few times, Acture learns when that is and plans it there.
      </p>
    )
  }

  const { usual, planned } = rhythm
  const current = time ? toMin(time) : planned
  const apart = usual !== null && current !== null && Math.abs(usual - current) >= NEAR_MINUTES
  const canPlan = kind === 'Task' && !!onPlanAt && usual !== null && (time === null || apart)

  return (
    <div className="mt-3 rounded-lg border border-border/70 px-3 pt-2.5 pb-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold">
          {usual !== null ? <>Usually around <span className="tabular-nums">{hhmm(usual)}</span></> : 'Learning when you do this'}
        </p>
        <span className="text-[12px] text-muted-foreground shrink-0">last two weeks</span>
      </div>
      <p className="text-[12px] text-muted-foreground tabular-nums">
        {planned !== null && <>planned {hhmm(planned)} · </>}done {rhythm.doneDays} of {rhythm.days.length} days
      </p>
      <RhythmChart rhythm={rhythm} />
      {(canPlan || (kind === 'Habit' && apart)) && (
        <div className="flex items-center gap-2 mt-1.5 text-[12.5px]">
          {canPlan ? (
            <button
              type="button"
              onClick={() => onPlanAt!(hhmm(usual!))}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1 font-semibold hover:opacity-90"
            >
              <Clock className="w-3.5 h-3.5" /> Plan it at {hhmm(usual!)}
            </button>
          ) : (
            <span className="text-muted-foreground">Your next plans put it there.</span>
          )}
        </div>
      )}
    </div>
  )
}

/** The dots, the plan, and the line from one to the other. */
export function RhythmChart({ rhythm }: { rhythm: Rhythm }) {
  const { days, planned, usual } = rhythm
  const W = 560, H = 150, x0 = 46, x1 = W - 8, top = 12, bottom = H - 24
  const points = days.filter((d) => d.minute !== null).map((d) => d.minute!)
  const values = [...points, ...(planned !== null ? [planned] : []), ...(usual !== null ? [usual] : [])]
  // Whole hours around what there is, at least three of them.
  let lo = Math.floor((Math.min(...values) - 30) / 60) * 60
  let hi = Math.ceil((Math.max(...values) + 30) / 60) * 60
  if (hi - lo < 180) { const pad = (180 - (hi - lo)) / 2; lo -= Math.ceil(pad / 60) * 60; hi += Math.floor(pad / 60) * 60 }
  lo = Math.max(0, lo); hi = Math.min(24 * 60, Math.max(hi, lo + 180))
  const ys = (m: number) => top + ((m - lo) / (hi - lo)) * (bottom - top)
  const xs = (i: number) => x0 + 10 + i * ((x1 - x0 - 20) / (days.length - 1))
  const grid = [lo, Math.round((lo + hi) / 120) * 60, hi]
  const curved = planned !== null && usual !== null && Math.abs(planned - usual) >= NEAR_MINUTES

  const said = [
    usual !== null ? `usually done around ${hhmm(usual)}` : null,
    planned !== null ? `planned ${hhmm(planned)}` : null,
    `done ${rhythm.doneDays} of the last ${days.length} days`,
  ].filter(Boolean).join(', ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={said} className="block mt-1.5 overflow-visible text-[11px]">
      {grid.map((m) => (
        <g key={m}>
          <line x1={x0} x2={W} y1={ys(m)} y2={ys(m)} className="stroke-border" strokeWidth={1} />
          <text x={0} y={ys(m) + 4} className="fill-muted-foreground tabular-nums">{hhmm(m % 1440)}</text>
        </g>
      ))}
      {planned !== null && (
        <>
          <line x1={x0 + 4} x2={x1} y1={ys(planned)} y2={ys(planned)} className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="3 5" opacity={curved ? 0.5 : 0.9} />
          <text x={x0 + 4} y={ys(planned) - 6} className="fill-muted-foreground font-medium">planned</text>
        </>
      )}
      {days.map((d, i) => (
        <g key={d.date}>
          {d.minute !== null && <circle cx={xs(i)} cy={ys(d.minute)} r={5.5} className="fill-amber-500" />}
          <text x={xs(i)} y={H - 4} textAnchor="middle" className={i === days.length - 1 ? 'fill-foreground font-semibold' : 'fill-muted-foreground'}>
            {INITIAL[new Date(d.date + 'T00:00:00').getDay()]}
          </text>
        </g>
      ))}
      {usual !== null && (
        <>
          <path
            d={curved
              ? `M ${x0 + 4} ${ys(planned!)} C ${(x0 + x1) / 2} ${ys(planned!)}, ${(x0 + x1) / 2} ${ys(usual)}, ${x1} ${ys(usual)}`
              : `M ${x0 + 4} ${ys(usual)} L ${x1} ${ys(usual)}`}
            fill="none"
            className="stroke-foreground"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text x={x1} y={ys(usual) - 8} textAnchor="end" className="fill-foreground font-bold tabular-nums text-[12.5px]">{hhmm(usual)}</text>
        </>
      )}
    </svg>
  )
}
