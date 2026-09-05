'use client'

import { useEffect, useRef, useState } from 'react'
import type { CalendarBlock, CalendarEvent } from './CalendarView'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import {
  HOUR_HEIGHT, SLOT_HEIGHT,
  DroppableSlot, PositionedBlock, EventBlock, DropPreview, layoutOverlaps,
} from './blockRendering'
import { todayStr } from '@/lib/date'

// ── Main TimeGrid ─────────────────────────────────────────────────────

interface TimeGridProps {
  date: string
  blocks: CalendarBlock[]
  events: CalendarEvent[]
  activeId: string | null
  overSlot: { date: string; slot: number } | null
  activeDurationSlots: number
  onResize: (blockId: number, endTime: string) => void
  onDelete: (block: CalendarBlock) => void
}

export function TimeGrid({
  date,
  blocks,
  events,
  activeId,
  overSlot,
  activeDurationSlots,
  onResize,
  onDelete,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowPx, setNowPx] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)

  // Scroll to current time on mount — this only fires once now, since
  // CalendarView keeps this component mounted across refreshes (see the
  // `refresh()` vs `load()` split there) instead of unmounting it behind
  // a loading flag on every action.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    const px = ((now.getHours() * 60 + now.getMinutes()) / 30) * SLOT_HEIGHT
    el.scrollTop = Math.max(0, px - el.clientHeight / 2)
  }, [])

  // Update now line every minute
  useEffect(() => {
    function update() {
      const now = new Date()
      setNowPx(((now.getHours() * 60 + now.getMinutes()) / 30) * SLOT_HEIGHT)
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  const isToday = date === todayStr()

  return (
    <>
      {selectedNodeId !== null && (
        <NodeDetailPanel
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>

          {/* Hour rows — labels + grid lines */}
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="flex absolute inset-x-0"
              style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              {/* Hour label */}
              <div className="w-14 shrink-0 flex items-start justify-end pr-3 pt-1">
                <span className="text-[10px] font-mono text-muted-foreground/55 leading-none">
                  {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
                </span>
              </div>

              {/* Grid cell */}
              <div className="flex-1 border-t border-border/15 relative">
                {/* 30-min dotted line */}
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/8" />
              </div>
            </div>
          ))}

          {/* Drop zones (sit behind blocks) */}
          <div className="absolute" style={{ left: 56, right: 0, top: 0, height: 24 * HOUR_HEIGHT }}>
            {Array.from({ length: 48 }, (_, slot) => (
              <DroppableSlot key={slot} date={date} slot={slot} />
            ))}
          </div>

          {/* Blocks + events + overlays (sit above drop zones) */}
          <div
            className="absolute"
            style={{ left: 56, right: 0, top: 0, height: 24 * HOUR_HEIGHT }}
          >
            {events.map((ev) => (
              <EventBlock key={`ev-${ev.id}`} event={ev} />
            ))}

            {layoutOverlaps(blocks).map(({ block, col, totalCols }) => (
              <PositionedBlock
                key={block.id}
                block={block}
                isDragging={activeId === `block:${block.id}`}
                onResize={onResize}
                onDelete={onDelete}
                onSelect={(nodeId) => setSelectedNodeId(nodeId)}
                col={col}
                totalCols={totalCols}
              />
            ))}

            {/* Drop preview */}
            {activeId && overSlot?.date === date && (
              <DropPreview slot={overSlot.slot} durationSlots={activeDurationSlots} />
            )}

            {/* Now line */}
            {isToday && (
              <div
                className="absolute inset-x-0 flex items-center pointer-events-none"
                style={{ top: nowPx }}
              >
                <div className="w-2 h-2 rounded-full bg-red-400 -ml-1 shrink-0" />
                <div className="flex-1 h-px bg-red-400/70" />
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
