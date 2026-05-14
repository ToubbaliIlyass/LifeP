'use client'

import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { X } from 'lucide-react'
import type { CalendarBlock, CalendarEvent } from './CalendarView'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'

const SLOT_HEIGHT = 32 // px per 30-min slot
const HOUR_HEIGHT = SLOT_HEIGHT * 2

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function timeToPx(time: string): number {
  return (timeToMinutes(time) / 30) * SLOT_HEIGHT
}

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 2)
  const m = slot % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; handle: string }> = {
  Task:    { bg: 'bg-sky-500/20',     border: 'border-sky-400/50',    text: 'text-sky-200',    handle: 'bg-sky-400/40' },
  Habit:   { bg: 'bg-emerald-500/20', border: 'border-emerald-400/50',text: 'text-emerald-200',handle: 'bg-emerald-400/40' },
  Goal:    { bg: 'bg-violet-500/20',  border: 'border-violet-400/50', text: 'text-violet-200', handle: 'bg-violet-400/40' },
  Project: { bg: 'bg-purple-500/20',  border: 'border-purple-400/50', text: 'text-purple-200', handle: 'bg-purple-400/40' },
}
const DEFAULT_COLORS = { bg: 'bg-muted/30', border: 'border-border/50', text: 'text-muted-foreground', handle: 'bg-muted-foreground/30' }
const EVENT_COLORS = { bg: 'bg-amber-500/20', border: 'border-amber-400/50', text: 'text-amber-200', handle: '' }

// ── Slot drop target ──────────────────────────────────────────────────

function DroppableSlot({ slot }: { slot: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot}` })
  return (
    <div
      ref={setNodeRef}
      className={`absolute inset-x-0 transition-colors ${isOver ? 'bg-primary/10' : ''}`}
      style={{ top: slot * SLOT_HEIGHT, height: SLOT_HEIGHT }}
    />
  )
}

// ── Positioned block (draggable) ──────────────────────────────────────

interface BlockProps {
  block: CalendarBlock
  isDragging: boolean
  onResize: (blockId: number, endTime: string) => void
  onDelete: (blockId: number) => void
  onSelect: (nodeId: number) => void
}

function PositionedBlock({ block, isDragging, onResize, onDelete, onSelect }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `block:${block.id}` })
  const colors = block.source ? (TYPE_COLORS[block.source.type] ?? DEFAULT_COLORS) : DEFAULT_COLORS
  const top = timeToPx(block.startTime)
  const height = Math.max(SLOT_HEIGHT, timeToPx(block.endTime) - top)

  // Resize state
  const resizeRef = useRef<{ startY: number; startEndMinutes: number } | null>(null)
  const [resizeEndTime, setResizeEndTime] = useState<string | null>(null)

  function handleResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = {
      startY: e.clientY,
      startEndMinutes: timeToMinutes(block.endTime),
    }
  }

  function handleResizePointerMove(e: React.PointerEvent) {
    if (!resizeRef.current) return
    const deltaSlots = Math.round((e.clientY - resizeRef.current.startY) / SLOT_HEIGHT)
    const newEndMinutes = Math.max(
      timeToMinutes(block.startTime) + 30,
      resizeRef.current.startEndMinutes + deltaSlots * 30,
    )
    setResizeEndTime(minutesToTime(Math.min(newEndMinutes, 24 * 60 - 30)))
  }

  function handleResizePointerUp() {
    if (!resizeRef.current || !resizeEndTime) {
      resizeRef.current = null
      return
    }
    const endTime = resizeEndTime
    resizeRef.current = null
    setResizeEndTime(null)
    onResize(block.id, endTime)
  }

  const displayEnd = resizeEndTime ?? block.endTime
  const displayHeight = Math.max(SLOT_HEIGHT, timeToPx(displayEnd) - top)

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : {}

  return (
    <div
      ref={setNodeRef}
      style={{ top, height: displayHeight, ...style }}
      className={`absolute inset-x-1 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-opacity ${colors.bg} ${colors.border} ${isDragging ? 'opacity-30' : 'opacity-100'}`}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-1 px-2 pt-1.5 pb-1">
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-serif leading-tight truncate ${colors.text}`}>
            {block.source?.name ?? 'Time block'}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground/50 mt-0.5">
            {block.startTime} – {displayEnd}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {block.source && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSelect(block.source!.id) }}
              className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors"
              title="View node"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.5A5.5 5.5 0 1 1 8 13.5 5.5 5.5 0 0 1 8 2.5zM8 5v3l2 1" />
              </svg>
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(block.id) }}
            className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
            title="Remove block"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className={`absolute bottom-0 inset-x-0 h-2 cursor-ns-resize rounded-b-lg ${colors.handle} opacity-0 hover:opacity-100 transition-opacity`}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      />
    </div>
  )
}

// ── Event block (not draggable) ───────────────────────────────────────

function EventBlock({ event }: { event: CalendarEvent }) {
  if (!event.time) return null
  const top = timeToPx(event.time)
  const durationMins = event.duration ?? 60
  const height = Math.max(SLOT_HEIGHT, (durationMins / 30) * SLOT_HEIGHT)

  return (
    <div
      className={`absolute inset-x-1 rounded-lg border select-none cursor-default ${EVENT_COLORS.bg} ${EVENT_COLORS.border}`}
      style={{ top, height }}
    >
      <div className="px-2 pt-1.5">
        <p className={`text-[11px] font-serif leading-tight truncate ${EVENT_COLORS.text}`}>{event.name}</p>
        <p className="text-[9px] font-mono text-amber-400/50 mt-0.5">
          {event.time}{event.duration ? ` – ${minutesToTime(timeToMinutes(event.time) + event.duration)}` : ''}
          {event.location ? ` · ${event.location}` : ''}
        </p>
      </div>
    </div>
  )
}

// ── Drop preview ──────────────────────────────────────────────────────

function DropPreview({ slot, durationSlots }: { slot: number; durationSlots: number }) {
  const top = slot * SLOT_HEIGHT
  const height = Math.min(durationSlots, 48 - slot) * SLOT_HEIGHT
  return (
    <div
      className="absolute inset-x-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary/8 pointer-events-none"
      style={{ top, height }}
    />
  )
}

// ── Main TimeGrid ─────────────────────────────────────────────────────

interface TimeGridProps {
  date: string
  blocks: CalendarBlock[]
  events: CalendarEvent[]
  activeId: string | null
  overSlot: number | null
  activeDurationSlots: number
  onResize: (blockId: number, endTime: string) => void
  onDelete: (blockId: number) => void
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

  // Scroll to current time on mount
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

  const isToday = date === new Date().toISOString().split('T')[0]

  return (
    <>
      {selectedNodeId !== null && (
        <NodeDetailPanel
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
                <span className="text-[10px] font-mono text-muted-foreground/30 leading-none">
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
              <DroppableSlot key={slot} slot={slot} />
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

            {blocks.map((block) => (
              <PositionedBlock
                key={block.id}
                block={block}
                isDragging={activeId === `block:${block.id}`}
                onResize={onResize}
                onDelete={onDelete}
                onSelect={(nodeId) => setSelectedNodeId(nodeId)}
              />
            ))}

            {/* Drop preview */}
            {activeId && overSlot !== null && (
              <DropPreview slot={overSlot} durationSlots={activeDurationSlots} />
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

// Re-export for time conversion used in CalendarView
export { slotToTime }
