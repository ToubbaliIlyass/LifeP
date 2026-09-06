'use client'

import { useEffect, useRef, useState } from 'react'
import type { CalendarBlock, CalendarEvent } from './CalendarView'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import {
  HOUR_HEIGHT, SLOT_HEIGHT,
  DroppableSlot, PositionedBlock, EventBlock, DropPreview, layoutOverlaps,
  SLOT_MINUTES, SLOTS_PER_DAY, WEEK_DROP_STEP,
} from './blockRendering'
import { todayStr } from '@/lib/date'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface DayData {
  blocks: CalendarBlock[]
  events: CalendarEvent[]
}

interface WeekGridProps {
  dates: string[]
  data: Record<string, DayData>
  activeId: string | null
  overSlot: { date: string; slot: number } | null
  activeDurationSlots: number
  onResize: (blockId: number, endTime: string) => void
  onDelete: (block: CalendarBlock) => void
  onSelectDay: (date: string) => void
  /** Bumped by the "today" button so the grid re-scrolls even when the displayed week hasn't changed. */
  scrollToNowSignal?: number
}

export function WeekGrid({
  dates,
  data,
  activeId,
  overSlot,
  activeDurationSlots,
  onResize,
  onDelete,
  onSelectDay,
  scrollToNowSignal,
}: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowPx, setNowPx] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const today = todayStr()

  // Scroll to current time on mount, and again whenever the "today" button
  // bumps scrollToNowSignal — CalendarView keeps this component mounted
  // across refreshes, so without that signal there'd be no way to
  // re-trigger this once you'd scrolled away from now.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    const px = ((now.getHours() * 60 + now.getMinutes()) / SLOT_MINUTES) * SLOT_HEIGHT
    el.scrollTop = Math.max(0, px - el.clientHeight / 2)
  }, [scrollToNowSignal])

  useEffect(() => {
    function update() {
      const now = new Date()
      setNowPx(((now.getHours() * 60 + now.getMinutes()) / SLOT_MINUTES) * SLOT_HEIGHT)
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {selectedNodeId !== null && (
        <NodeDetailPanel
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div className="flex min-w-[820px]">
          {/* Hour label column */}
          <div className="w-14 shrink-0 sticky left-0 z-10 bg-background">
            <div className="h-9 border-b border-border/40" />
            <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="absolute inset-x-0 flex justify-end pr-2 pt-1" style={{ top: hour * HOUR_HEIGHT }}>
                  <span className="text-[10px] font-mono text-muted-foreground/55 leading-none">
                    {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {dates.map((d) => {
            const isToday = d === today
            const dayData = data[d]
            const dow = new Date(d + 'T00:00:00').getDay()
            const dayNum = parseInt(d.slice(8, 10), 10)
            return (
              <div key={d} className="flex-1 min-w-[108px] border-l border-border/15">
                <button
                  onClick={() => onSelectDay(d)}
                  className={`w-full h-9 flex flex-col items-center justify-center border-b border-border/40 hover:bg-muted/40 transition-colors ${
                    isToday ? 'bg-primary/5' : ''
                  }`}
                >
                  <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest leading-none">
                    {DOW_LABELS[dow]}
                  </span>
                  <span className={`text-[12px] leading-none mt-0.5 ${isToday ? 'text-primary font-semibold' : 'text-foreground/70'}`}>
                    {dayNum}
                  </span>
                </button>

                <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
                  {/* Hour gridlines */}
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour} className="absolute inset-x-0 border-t border-border/15" style={{ top: hour * HOUR_HEIGHT }} />
                  ))}

                  {/* Drop zones */}
                  {/*
                    Seven columns of ten-minute drop targets would be over a
                    thousand registered droppables; the week keeps half-hour
                    targets while slot numbers stay in the same unit as
                    everywhere else, so a block dropped here still lands where
                    the day view would put it.
                  */}
                  {Array.from({ length: SLOTS_PER_DAY / WEEK_DROP_STEP }, (_, i) => i * WEEK_DROP_STEP).map((slot) => (
                    <DroppableSlot key={slot} date={d} slot={slot} />
                  ))}

                  {(dayData?.events ?? []).map((ev) => (
                    <EventBlock key={`ev-${ev.id}`} event={ev} compact />
                  ))}

                  {layoutOverlaps(dayData?.blocks ?? []).map(({ block, col, totalCols }) => (
                    <PositionedBlock
                      key={block.id}
                      block={block}
                      isDragging={activeId === `block:${block.id}`}
                      onResize={onResize}
                      onDelete={onDelete}
                      onSelect={(nodeId) => setSelectedNodeId(nodeId)}
                      compact
                      col={col}
                      totalCols={totalCols}
                    />
                  ))}

                  {activeId && overSlot?.date === d && (
                    <DropPreview slot={overSlot.slot} durationSlots={activeDurationSlots} />
                  )}

                  {isToday && (
                    <div className="absolute inset-x-0 flex items-center pointer-events-none" style={{ top: nowPx }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 -ml-0.5 shrink-0" />
                      <div className="flex-1 h-px bg-red-400/70" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
