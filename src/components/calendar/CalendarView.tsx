'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { TimeGrid } from './TimeGrid'
import { UnscheduledRail } from './UnscheduledRail'

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

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

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

function offsetDay(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDateHeader(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const today = todayStr()
  const label = date === today ? 'Today' : date === offsetDay(today, 1) ? 'Tomorrow' : date === offsetDay(today, -1) ? 'Yesterday' : ''
  const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return label ? `${label} — ${formatted}` : formatted
}

export function CalendarView() {
  const [date, setDate] = useState(todayStr())
  const [blocks, setBlocks] = useState<CalendarBlock[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDurationSlots, setActiveDurationSlots] = useState(2)
  const [overSlot, setOverSlot] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/calendar?date=${date}`)
      .then((r) => r.json())
      .then(({ blocks: b, events: e }: { blocks: CalendarBlock[]; events: CalendarEvent[] }) => {
        setBlocks(b)
        setEvents(e)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [date])

  useEffect(() => { load() }, [load])

  const scheduledNodeIds = useMemo(
    () => new Set(blocks.map((b) => b.source?.id).filter((id): id is number => id !== undefined)),
    [blocks],
  )

  async function createBlock(sourceNodeId: number | undefined, startTime: string, endTime: string) {
    await fetch('/api/calendar/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, startTime, endTime, sourceNodeId }),
    })
    load()
  }

  async function moveBlock(blockId: number, startTime: string, endTime: string) {
    await fetch(`/api/calendar/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, endTime }),
    })
    load()
  }

  async function resizeBlock(blockId: number, endTime: string) {
    await fetch(`/api/calendar/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endTime }),
    })
    load()
  }

  async function deleteBlock(blockId: number) {
    await fetch(`/api/calendar/blocks/${blockId}`, { method: 'DELETE' })
    load()
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = active.id.toString()
    setActiveId(id)
    if (id.startsWith('block:')) {
      const blockId = parseInt(id.replace('block:', ''))
      const block = blocks.find((b) => b.id === blockId)
      if (block) setActiveDurationSlots(timeToSlots(block.startTime, block.endTime))
      else setActiveDurationSlots(2)
    } else {
      setActiveDurationSlots(2) // default 1 hour for new blocks
    }
  }

  function handleDragOver({ over }: DragOverEvent) {
    if (over?.id.toString().startsWith('slot:')) {
      setOverSlot(parseInt(over.id.toString().replace('slot:', '')))
    } else {
      setOverSlot(null)
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const id = active.id.toString()
    setActiveId(null)
    setOverSlot(null)

    if (!over?.id.toString().startsWith('slot:')) return

    const slot = parseInt(over.id.toString().replace('slot:', ''))
    const startTime = slotToTime(slot)
    const endSlot = Math.min(47, slot + activeDurationSlots)
    const endTime = slotToTime(endSlot)

    if (id.startsWith('rail:')) {
      const sourceNodeId = parseInt(id.replace('rail:', ''))
      createBlock(isNaN(sourceNodeId) ? undefined : sourceNodeId, startTime, endTime)
    } else if (id.startsWith('block:')) {
      const blockId = parseInt(id.replace('block:', ''))
      moveBlock(blockId, startTime, endTime)
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
      const block = blocks.find((b) => b.id === blockId)
      return block?.source?.name ?? 'Time block'
    }
    return '' // rail items carry their own name in useDraggable data
  }, [activeId, blocks])

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full overflow-hidden">
        {/* Left rail */}
        <UnscheduledRail
          date={date}
          scheduledNodeIds={scheduledNodeIds}
        />

        {/* Main calendar area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Date nav header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 shrink-0">
            <button
              onClick={() => setDate((d) => offsetDay(d, -1))}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-[13px] font-medium text-foreground/80 flex-1 text-center">
              {formatDateHeader(date)}
            </p>
            <button
              onClick={() => setDate((d) => offsetDay(d, 1))}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {date !== todayStr() && (
              <button
                onClick={() => setDate(todayStr())}
                className="text-[11px] font-mono text-primary hover:opacity-80 transition-opacity ml-1"
              >
                today
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] font-mono text-muted-foreground/40">loading…</p>
            </div>
          ) : (
            <TimeGrid
              date={date}
              blocks={blocks}
              events={events}
              activeId={activeId}
              overSlot={overSlot}
              activeDurationSlots={activeDurationSlots}
              onResize={resizeBlock}
              onDelete={deleteBlock}
            />
          )}
        </div>
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
