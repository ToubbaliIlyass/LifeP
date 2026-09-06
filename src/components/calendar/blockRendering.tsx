'use client'

import { useRef, useState } from 'react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { X } from 'lucide-react'
import type { CalendarBlock, CalendarEvent } from './CalendarView'

// Shared by TimeGrid (single day) and WeekGrid (7 columns) so both grids
// render blocks/events/drop-zones identically instead of drifting apart.

/*
 * The grid's unit of time. Was 30 minutes, which meant a five-minute habit
 * could only ever start on the hour or the half hour — every short thing
 * landed on the same handful of positions. Ten divides the hour evenly and is
 * fine enough to place a five-minute routine without turning the day into a
 * wall of lines.
 *
 * Every conversion below derives from this, so the grid, the blocks, the drag
 * targets and the resize handles cannot disagree about how long a slot is.
 */
export const SLOT_MINUTES = 10
/*
 * Taller than the old 64px. Ten-minute precision is worthless if ten minutes
 * is six pixels: the grid has to give a short block somewhere to be before it
 * can be placed accurately.
 */
export const HOUR_HEIGHT = 96
export const SLOT_HEIGHT = HOUR_HEIGHT / (60 / SLOT_MINUTES)
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES
/** Week view drops on half-hours: seven columns of ten-minute targets is too many. */
export const WEEK_DROP_STEP = 30 / SLOT_MINUTES
/*
 * Floor for a block's height, so a very short one is still readable.
 *
 * Kept deliberately small. At 44px — the old value, sized for half-hour slots
 * — a five-minute habit would be drawn over forty minutes of grid and collide
 * with whatever came next, which is the stacked mess this was meant to fix.
 * 26px is a single legible line and under twenty minutes of grid.
 */
export const MIN_BLOCK_HEIGHT = 26
/** Below this, a block only has room for its title. */
const TIGHT_HEIGHT = 40

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function timeToPx(time: string): number {
  return (timeToMinutes(time) / SLOT_MINUTES) * SLOT_HEIGHT
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; handle: string }> = {
  Task:    { bg: 'bg-sky-200/50 dark:bg-sky-500/15',     border: 'border-sky-300/60 dark:border-sky-400/35',     text: 'text-sky-700 dark:text-sky-200',     handle: 'bg-sky-300/50 dark:bg-sky-400/30' },
  Habit:   { bg: 'bg-emerald-200/50 dark:bg-emerald-500/15', border: 'border-emerald-300/60 dark:border-emerald-400/35', text: 'text-emerald-700 dark:text-emerald-200', handle: 'bg-emerald-300/50 dark:bg-emerald-400/30' },
  Goal:    { bg: 'bg-violet-200/50 dark:bg-violet-500/15',  border: 'border-violet-300/60 dark:border-violet-400/35', text: 'text-violet-700 dark:text-violet-200', handle: 'bg-violet-300/50 dark:bg-violet-400/30' },
  Project: { bg: 'bg-purple-200/50 dark:bg-purple-500/15',  border: 'border-purple-300/60 dark:border-purple-400/35', text: 'text-purple-700 dark:text-purple-200', handle: 'bg-purple-300/50 dark:bg-purple-400/30' },
}
export const DEFAULT_COLORS = { bg: 'bg-muted/30', border: 'border-border/50', text: 'text-muted-foreground', handle: 'bg-muted-foreground/30' }
export const EVENT_COLORS = { bg: 'bg-amber-200/50 dark:bg-amber-500/15', border: 'border-amber-300/60 dark:border-amber-400/35', text: 'text-amber-700 dark:text-amber-200', handle: '' }

// ── Overlap layout ──────────────────────────────────────────────────
// Two blocks scheduled at overlapping times used to render fully on top
// of each other (both absolutely positioned edge-to-edge). This packs
// each day's blocks into side-by-side columns instead, like a standard
// calendar day view: blocks that don't overlap anything stay full-width;
// blocks in a cluster of N mutually-overlapping blocks each get 1/N of
// the width, side by side.

export interface BlockLayout { block: CalendarBlock; col: number; totalCols: number }

export function layoutOverlaps(blocks: CalendarBlock[]): BlockLayout[] {
  const sorted = [...blocks].sort((a, b) =>
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || timeToMinutes(a.endTime) - timeToMinutes(b.endTime),
  )

  const result: BlockLayout[] = []
  let cluster: { block: CalendarBlock; col: number }[] = []
  let colEndTimes: number[] = []
  let clusterEnd = -Infinity

  function flushCluster() {
    if (cluster.length === 0) return
    const totalCols = colEndTimes.length
    for (const c of cluster) result.push({ block: c.block, col: c.col, totalCols })
    cluster = []
    colEndTimes = []
  }

  for (const block of sorted) {
    const start = timeToMinutes(block.startTime)
    const end = Math.max(start + 1, timeToMinutes(block.endTime))
    if (start >= clusterEnd) {
      flushCluster()
      clusterEnd = -Infinity
    }
    let col = colEndTimes.findIndex((e) => e <= start)
    if (col === -1) { col = colEndTimes.length; colEndTimes.push(end) } else { colEndTimes[col] = end }
    cluster.push({ block, col })
    clusterEnd = Math.max(clusterEnd, end)
  }
  flushCluster()

  return result
}

// ── Slot drop target ──────────────────────────────────────────────────
// Id encodes the date so a single DndContext can span multiple day
// columns (week view) as well as one (day view) without ambiguity.

export function DroppableSlot({ date, slot }: { date: string; slot: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${date}:${slot}` })
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
  onDelete: (block: CalendarBlock) => void
  onSelect: (nodeId: number) => void
  /** Week view needs narrower blocks to fit 7 columns; day view keeps the roomier default. */
  compact?: boolean
  /** Position within a cluster of overlapping blocks — see layoutOverlaps. Defaults to full-width, no overlap. */
  col?: number
  totalCols?: number
}

export function PositionedBlock({ block, isDragging, onResize, onDelete, onSelect, compact, col = 0, totalCols = 1 }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `block:${block.id}` })
  const colors = block.source ? (TYPE_COLORS[block.source.type] ?? DEFAULT_COLORS) : DEFAULT_COLORS
  const top = timeToPx(block.startTime)
  const left = `calc(${(col / totalCols) * 100}% + 2px)`
  const width = `calc(${100 / totalCols}% - 4px)`

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
      timeToMinutes(block.startTime) + SLOT_MINUTES,
      resizeRef.current.startEndMinutes + deltaSlots * SLOT_MINUTES,
    )
    setResizeEndTime(minutesToTime(Math.min(newEndMinutes, 24 * 60 - SLOT_MINUTES)))
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
  const naturalHeight = timeToPx(displayEnd) - top
  const displayHeight = Math.max(compact ? SLOT_HEIGHT : MIN_BLOCK_HEIGHT, naturalHeight)
  // A short block drops its second line rather than crushing both.
  const tight = compact || naturalHeight < TIGHT_HEIGHT

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : {}

  return (
    <div
      ref={setNodeRef}
      style={{ top, height: displayHeight, left, width, ...style }}
      className={`absolute rounded-lg border cursor-grab active:cursor-grabbing select-none transition-opacity ${colors.bg} ${colors.border} ${isDragging ? 'opacity-30' : 'opacity-100'}`}
      {...listeners}
      {...attributes}
    >
      <div className={`flex items-start justify-between gap-1 ${tight ? 'pt-1 pb-0.5' : 'pt-2 pb-1'} ${tight ? 'px-1.5' : 'px-2'}`}>
        <div className="flex-1 min-w-0">
          <p className={`font-serif leading-tight truncate ${colors.text} ${tight ? 'text-[10px]' : 'text-[11px]'}`}>
            {block.source?.name ?? 'Time block'}
          </p>
          {!tight && (
            <p className="text-[9px] font-mono text-muted-foreground/50 mt-0.5">
              {block.startTime} – {displayEnd}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {block.source && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSelect(block.source!.id) }}
              className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground/65 hover:text-foreground transition-colors"
              title="View node"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.5A5.5 5.5 0 1 1 8 13.5 5.5 5.5 0 0 1 8 2.5zM8 5v3l2 1" />
              </svg>
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(block) }}
            className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground/65 hover:text-destructive transition-colors"
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

export function EventBlock({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  if (!event.time) return null
  const top = timeToPx(event.time)
  const durationMins = event.duration ?? 60
  const natural = (durationMins / SLOT_MINUTES) * SLOT_HEIGHT
  const height = Math.max(compact ? SLOT_HEIGHT : MIN_BLOCK_HEIGHT, natural)
  const tight = compact || natural < TIGHT_HEIGHT

  return (
    <div
      className={`absolute inset-x-1 rounded-lg border select-none cursor-default ${EVENT_COLORS.bg} ${EVENT_COLORS.border}`}
      style={{ top, height }}
    >
      <div className={`${tight ? 'pt-1 px-1.5' : 'pt-1.5 px-2'}`}>
        <p className={`font-serif leading-tight truncate ${EVENT_COLORS.text} ${tight ? 'text-[10px]' : 'text-[11px]'}`}>{event.name}</p>
        {!tight && (
          <p className="text-[9px] font-mono text-amber-700/60 dark:text-amber-400/50 mt-0.5">
            {event.time}{event.duration ? ` – ${minutesToTime(timeToMinutes(event.time) + event.duration)}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Drop preview ──────────────────────────────────────────────────────

export function DropPreview({ slot, durationSlots }: { slot: number; durationSlots: number }) {
  const top = slot * SLOT_HEIGHT
  const height = Math.min(durationSlots, 48 - slot) * SLOT_HEIGHT
  return (
    <div
      className="absolute inset-x-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary/8 pointer-events-none"
      style={{ top, height }}
    />
  )
}
