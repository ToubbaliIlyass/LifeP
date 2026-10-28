import { eventOccursOn } from '@/lib/date'
import { getNodeById, updateNode } from '@/lib/graph/queries'
import { resolveOccurrence, statusOn, type EventStatus } from '@/lib/event-status'

export type ResolveOutcome =
  | { ok: true; date: string; status: EventStatus | null; was: EventStatus | null }
  | { ok: false; reason: 'not-found' | 'not-on-that-day' }

/**
 * Marks one occurrence of an event attended / cancelled / missed, or (status
 * null) puts it back. Shared by the screen's route and the assistant's tool.
 * Nothing but the event's own properties is written: see src/lib/event-status.ts.
 */
export async function resolveEvent(userId: number, eventId: number, date: string, status: EventStatus | null): Promise<ResolveOutcome> {
  const node = await getNodeById(userId, eventId)
  if (!node || node.type !== 'Event') return { ok: false, reason: 'not-found' }
  const p = node.properties as Record<string, unknown>
  const occurs = eventOccursOn({
    date: typeof p.date === 'string' ? p.date : null,
    frequency: typeof p.frequency === 'string' ? p.frequency : null,
    daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
    until: typeof p.until === 'string' ? p.until : null,
  }, date)
  if (!occurs) return { ok: false, reason: 'not-on-that-day' }
  await updateNode(userId, eventId, resolveOccurrence(p, date, status))
  return { ok: true, date, status, was: statusOn(p, date) }
}
