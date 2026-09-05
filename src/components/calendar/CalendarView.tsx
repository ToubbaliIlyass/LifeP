'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, ListTodo, CalendarDays, CalendarRange } from 'lucide-react'
import { TimeGrid } from './TimeGrid'
import { WeekGrid } from './WeekGrid'
import { UnscheduledRail } from './UnscheduledRail'
import { todayStr, addDays } from '@/lib/date'

export interface CalendarBlock {
  id: number
  startTime: string
  endTime: string
  source: { id: number; type: string; name: string } | null
}

export interface CalendarEvent {
  id: number
  name: string
  time: string | null
  duration: number | null
  location: string | null
}

interface DayData {
  blocks: CalendarBlock[]
  events: CalendarEvent[]
}

type ViewMode = 'day' | 'week'

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 2)
  const m = slot % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}

function timeToSlots(startTime: string, endTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return Math.max(1, Math.round((toMin(endTime) - toMin(startTime)) / 30))
}

function formatDateHeader(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const today = todayStr()
  const label = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : ''
  const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return label ? `${label} — ${formatted}` : formatted
}

function startOfWeek(date: string): string {
  const dow = new Date(date + 'T00:00:00').getDay()
  return addDays(date, -dow)
}

function weekDatesFor(anchor: string): string[] {
  const start = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

function formatWeekHeader(dates: string[]): string {
  const first = new Date(dates[0] + 'T00:00:00')
  const last = new Date(dates[6] + 'T00:00:00')
  const sameMonth = first.getMonth() === last.getMonth()
  const firstStr = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const lastStr = last.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  return `${firstStr} – ${lastStr}`
}

interface CalendarViewProps {
  /** From Settings. Only seeds the initial view — the toggle stays in charge after that. */
  initialViewMode?: ViewMode
  /** Lets the parent (page.tsx) react to Day/Week — e.g. to hide the chat panel while in Week view, since it needs the extra width. */
  onViewModeChange?: (mode: ViewMode) => void
}

export function CalendarView({ onViewModeChange, initialViewMode }: CalendarViewProps) {
  const [date, setDate] = useState(todayStr())
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode ?? 'day')
  const [dayData, setDayData] = useState<DayData>({ blocks: [], events: [] })
  const [weekData, setWeekData] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDurationSlots, setActiveDurationSlots] = useState(2)
  const [overSlot, setOverSlot] = useState<{ date: string; slot: number } | null>(null)
  const [railOpen, setRailOpen] = useState(false)
  const [unscheduledCount, setUnscheduledCount] = useState(0)
  // Bumped whenever "today" is clicked in week view, so WeekGrid re-scrolls
  // to the current time even when the anchor date doesn't actually change
  // (you're already viewing this week, just scrolled away from now).
  const [scrollToNowSignal, setScrollToNowSignal] = useState(0)
  const hasLoadedRef = useRef(false)

  useEffect(() => { onViewModeChange?.(viewMode) }, [viewMode, onViewModeChange])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const dates = useMemo(
    () => (viewMode === 'week' ? weekDatesFor(date) : [date]),
    [viewMode, date],
  )

  const fetchDay = useCallback(
    (d: string) => fetch(`/api/calendar?date=${d}`).then((r) => r.json()) as Promise<{ blocks: CalendarBlock[]; events: CalendarEvent[] }>,
    [],
  )

  // Fetches fresh data WITHOUT touching `loading` (after the first load) —
  // the grid components stay mounted across every create/move/resize/
  // delete, instead of being unmounted behind a loading flag on every
  // single action. That unmount/remount was the cause of two bugs: the
  // day grid's "scroll to now on mount" effect re-firing after any
  // action, and (combined with auto-fill re-creating today's habit
  // blocks) removing a scheduled habit appearing to silently undo itself.
  const refresh = useCallback(async () => {
    if (viewMode === 'day') {
      const { blocks, events } = await fetchDay(date)
      setDayData({ blocks, events })
    } else {
      const results = await Promise.all(dates.map((d) => fetchDay(d)))
      const next: Record<string, DayData> = {}
      dates.forEach((d, i) => { next[d] = results[i] })
      setWeekData(next)
    }
  }, [viewMode, date, dates, fetchDay])

  useEffect(() => {
    let cancelled = false
    if (!hasLoadedRef.current) setLoading(true)
    refresh().then(() => {
      if (cancelled) return
      hasLoadedRef.current = true
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [refresh])

  const scheduledNodeIds = useMemo(() => {
    const ids = new Set<number>()
    const source = viewMode === 'day' ? [dayData] : Object.values(weekData)
    for (const day of source) {
      for (const b of day.blocks) {
        if (b.source) ids.add(b.source.id)
      }
    }
    return ids
  }, [viewMode, dayData, weekData])

  const allBlocks = useMemo(
    () => (viewMode === 'day' ? dayData.blocks : Object.values(weekData).flatMap((d) => d.blocks)),
    [viewMode, dayData, weekData],
  )

  async function createBlock(blockDate: string, sourceNodeId: number | undefined, startTime: string, endTime: string) {
    await fetch('/api/calendar/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: blockDate, startTime, endTime, sourceNodeId }),
    })
    refresh()
  }

  async function moveBlock(blockId: number, blockDate: string, startTime: string, endTime: string) {
    await fetch(`/api/calendar/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: blockDate, startTime, endTime }),
    })
    refresh()
  }

  async function resizeBlock(blockId: number, endTime: string) {
    await fetch(`/api/calendar/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endTime }),
    })
    refresh()
  }

  async function deleteBlock(block: CalendarBlock, blockDate: string) {
    await fetch(`/api/calendar/blocks/${block.id}`, { method: 'DELETE' })
    // Habit slots are auto-filled for today and any future due day —
    // without this, removing one just reappears on the very next load.
    // Recording an (incomplete) HabitLog for that date tells the
    // auto-fill pass the user already made a call on this occurrence, so
    // it leaves it alone. Past days were never auto-filled in the first
    // place, so no marker is needed there.
    if (block.source?.type === 'Habit' && blockDate >= todayStr()) {
      await fetch(`/api/habits/${block.source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false, date: blockDate }),
      })
    }
    refresh()
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = active.id.toString()
    setActiveId(id)
    if (id.startsWith('block:')) {
      const blockId = parseInt(id.replace('block:', ''))
      const block = allBlocks.find((b) => b.id === blockId)
      if (block) setActiveDurationSlots(timeToSlots(block.startTime, block.endTime))
      else setActiveDurationSlots(2)
    } else {
      setActiveDurationSlots(2) // default 1 hour for new blocks
    }
  }

  function handleDragOver({ over }: DragOverEvent) {
    const idStr = over?.id.toString()
    if (idStr?.startsWith('slot:')) {
      const [, slotDate, slotStr] = idStr.split(':')
      setOverSlot({ date: slotDate, slot: parseInt(slotStr, 10) })
    } else {
      setOverSlot(null)
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const id = active.id.toString()
    setActiveId(null)
    setOverSlot(null)

    const idStr = over?.id.toString()
    if (!idStr?.startsWith('slot:')) return
    const [, blockDate, slotStr] = idStr.split(':')
    const slot = parseInt(slotStr, 10)
    const startTime = slotToTime(slot)
    const endSlot = Math.min(47, slot + activeDurationSlots)
    const endTime = slotToTime(endSlot)

    if (id.startsWith('rail:')) {
      const sourceNodeId = parseInt(id.replace('rail:', ''))
      createBlock(blockDate, isNaN(sourceNodeId) ? undefined : sourceNodeId, startTime, endTime)
    } else if (id.startsWith('block:')) {
      const blockId = parseInt(id.replace('block:', ''))
      moveBlock(blockId, blockDate, startTime, endTime)
    }
  }

  function handleDragCancel() {
    setActiveId(null)
    setOverSlot(null)
  }

  // Name for the DragOverlay pill
  const activeName = useMemo(() => {
    if (!activeId) return ''
    if (activeId.startsWith('block:')) {
      const blockId = parseInt(activeId.replace('block:', ''))
      const block = allBlocks.find((b) => b.id === blockId)
      return block?.source?.name ?? 'Time block'
    }
    return '' // rail items carry their own name in useDraggable data
  }, [activeId, allBlocks])

  function handleDeleteBlock(block: CalendarBlock) {
    const blockDate = viewMode === 'day'
      ? date
      : dates.find((d) => weekData[d]?.blocks.some((b) => b.id === block.id)) ?? date
    deleteBlock(block, blockDate)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full overflow-hidden relative">
        {/* Left rail — always visible at md+; below md it's opened via the header toggle */}
        <div className="hidden md:flex h-full">
          <UnscheduledRail
            date={date}
            scheduledNodeIds={scheduledNodeIds}
            onCountChange={setUnscheduledCount}
          />
        </div>

        {/* Main calendar area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Date nav header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 shrink-0">
            <button
              onClick={() => setRailOpen(true)}
              className="md:hidden relative p-1.5 -ml-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Show unscheduled tasks and habits"
            >
              <ListTodo className="w-4 h-4" />
              {unscheduledCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
            <button
              onClick={() => setDate((d) => addDays(d, viewMode === 'week' ? -7 : -1))}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-[13px] font-medium text-foreground/80 flex-1 text-center">
              {viewMode === 'week' ? formatWeekHeader(dates) : formatDateHeader(date)}
            </p>
            <button
              onClick={() => setDate((d) => addDays(d, viewMode === 'week' ? 7 : 1))}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {/*
              Day view: only worth showing once you've navigated off
              today. Week view: `date` is just the anchor used to compute
              the visible week — it can already equal today's date even
              when you've scrolled the grid away from the current time,
              or after navigating to a different week — so this stays
              visible any time it's useful, and always re-scrolls to now.
            */}
            {(viewMode === 'week' || date !== todayStr()) && (
              <button
                onClick={() => { setDate(todayStr()); setScrollToNowSignal((n) => n + 1) }}
                className="text-[11px] font-mono text-primary hover:opacity-80 transition-opacity"
              >
                today
              </button>
            )}
            <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 ml-1">
              <button
                onClick={() => setViewMode('day')}
                title="Day view"
                className={`p-1 rounded-md transition-colors ${viewMode === 'day' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('week')}
                title="Week view"
                className={`p-1 rounded-md transition-colors ${viewMode === 'week' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] font-mono text-muted-foreground/65">loading…</p>
            </div>
          ) : viewMode === 'day' ? (
            <TimeGrid
              date={date}
              blocks={dayData.blocks}
              events={dayData.events}
              activeId={activeId}
              overSlot={overSlot}
              activeDurationSlots={activeDurationSlots}
              onResize={resizeBlock}
              onDelete={handleDeleteBlock}
            />
          ) : (
            <WeekGrid
              dates={dates}
              data={weekData}
              activeId={activeId}
              overSlot={overSlot}
              activeDurationSlots={activeDurationSlots}
              onResize={resizeBlock}
              onDelete={handleDeleteBlock}
              onSelectDay={(d) => { setDate(d); setViewMode('day') }}
              scrollToNowSignal={scrollToNowSignal}
            />
          )}
        </div>

        {/* Mobile rail drawer */}
        {railOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setRailOpen(false)} />
            <div className="relative h-full">
              <UnscheduledRail
                date={date}
                scheduledNodeIds={scheduledNodeIds}
                onClose={() => setRailOpen(false)}
              />
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId && (
          <div className="px-3 py-1.5 rounded-lg bg-card border border-border/80 shadow-xl text-[12px] font-serif text-foreground/80 whitespace-nowrap pointer-events-none">
            {activeName || 'Block'}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
