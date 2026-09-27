'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { Resurfaced } from '@/components/activity/Resurfaced'
import { WeatherStrip } from './WeatherStrip'
import { NowQueue, nowIsCached } from './NowQueue'
import { TodayAssistant } from './TodayAssistant'
import { DailyQuote } from './DailyQuote'
import { GoalNudgeCard, NothingYet, ProjectList, PulseStrip } from './TodayPulse'
import type { ActiveProject, GoalNudge, Pulse } from '@/lib/today'

/*
 * The dashboard.
 *
 * It used to be five lists — habits, tasks, events, goals — sitting under a
 * Now timeline that already contained the first three. The busier the day,
 * the longer the page got saying the same thing repeatedly, and the goals
 * list was on screen every single day, which is how a thing stops being
 * read. What is left is the sequence, and then only what the sequence cannot
 * tell you:
 *
 *   Now        what has a time, in order               (NowQueue)
 *     beside   habits with no time, what is due, the week ahead (DayColumn)
 *   Projects   what is under way and how far along
 *   Goal       one, and only when one is being neglected
 *   Resurface  what has gone quiet long enough to review
 *   Last 7d    how it has actually been going, and what slipped yesterday
 *
 * Nothing is listed twice: a habit or task with a slot is on the rail, one
 * without is in the column, never both.
 */

interface TodayData {
  projects: ActiveProject[]
  nudge: GoalNudge | null
  pulse: Pulse
}

interface TodayViewProps {
  onNavigate?: (tab: string) => void
  refreshKey?: number
  /** Set in Settings; the strip is hidden until a location exists. */
  weather?: { enabled: boolean; lat: number | null; lon: number | null; place: string | null }
  /** Simple mode: capture and the day, nothing reviewed or summarised. */
  simple?: boolean
}

export function TodayView({ onNavigate, refreshKey, weather, simple = false }: TodayViewProps) {
  const [data, setData] = useState<TodayData | null>(null)
  // Simple mode shows none of what /api/today returns, so it neither asks
  // for it nor waits on it.
  const [loading, setLoading] = useState(!simple)
  /*
   * The assistant needs nothing loaded and the plan does, so on their own
   * the one appeared a beat before the other. The column stays hidden until
   * the plan can be drawn, then both arrive together — at once, when the
   * plan is already in memory from an earlier visit.
   */
  const [planReady, setPlanReady] = useState(nowIsCached)
  const markPlanReady = useCallback(() => setPlanReady(true), [])
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(() => {
    fetch('/api/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TodayData | null) => { if (d) setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { if (!simple) load() }, [load, refreshKey, simple])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[12px] font-mono text-muted-foreground/65">loading…</p>
      </div>
    )
  }

  const nothingPlanned =
    !!data && data.projects.length === 0 && !data.nudge && data.pulse.tasks.completed === 0

  return (
    <ScrollArea className="h-full">
      {/* One centred column: capture, then the day. */}
      <div className={`px-5 md:px-8 py-8 mx-auto w-full max-w-2xl transition-opacity duration-150 ${planReady ? 'opacity-100' : 'opacity-0'}`}>
        {!simple && weather?.enabled && weather.lat !== null && weather.lon !== null && (
          <WeatherStrip lat={weather.lat} lon={weather.lon} place={weather.place} />
        )}

        {/* The one way in (the chat aside): say what needs to happen, and it
            is read, added and planned in one go. The typed quick-add box and
            the approve-a-plan card it replaced only repeated this. */}
        {/* The day's name, centred over the column it heads. */}
        <h1 className="mb-6 text-center font-serif">
          <span className="block text-[11px] font-sans font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
            {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
          </span>
          <span className="block mt-1 text-[26px] leading-tight text-foreground">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </span>
        </h1>

        <TodayAssistant onNavigate={onNavigate} />

        {/* The whole point of the page. Renders nothing when the day is empty. */}
        <NowQueue onChanged={simple ? undefined : load} onReady={markPlanReady} />

        {data && !simple && (
          <>
            <ProjectList projects={data.projects} onOpen={setOpenId} />
            <GoalNudgeCard nudge={data.nudge} onOpen={setOpenId} />

            {/* The top few only — the full review lives in Activity. Renders
                nothing at all until something has actually gone quiet. */}
            <Resurfaced limit={3} onSeeAll={() => onNavigate?.('activity')} />

            <PulseStrip pulse={data.pulse} onNavigate={onNavigate} />

            {nothingPlanned && <NothingYet overdue={data.pulse.tasks.overdue} />}
          </>
        )}

        {!simple && <DailyQuote />}
      </div>

      {openId !== null && (
        <NodeDetailPanel
          nodeId={openId}
          onClose={() => setOpenId(null)}
          onMutated={() => { setOpenId(null); load() }}
        />
      )}
    </ScrollArea>
  )
}
