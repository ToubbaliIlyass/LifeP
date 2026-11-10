import { getNodes, getEdges } from '@/lib/graph/queries'
import { buildNowQueue, type PrayerSlot } from '@/lib/now'
import { readSettings } from '@/lib/settings'
import { workTypes } from '@/lib/modules'
import { zoneFor } from '@/lib/clock'
import { doneDatesOf, prayerKeyOf, prayerTimesFor } from '@/lib/prayers'

/**
 * One day, as the assistant reads it back: what is on the clock and what
 * still needs a time.
 *
 * Built from the same queue the Today page draws, so "what do I have today?"
 * answered in the chat is the day on screen, not a second opinion of it.
 */
export async function dayView(userId: number, date: string) {
  const settings = await readSettings(userId)
  const [nodes, scheduledEdges] = await Promise.all([getNodes(userId), getEdges(userId, { type: 'scheduled-for' })])
  const of = (type: string) => nodes.filter((n) => n.type === type)
  const dated = workTypes(settings)

  // The five are to-dos of their own, with the day's time worked out.
  const prayed = new Set(
    of('Task').flatMap((n) => {
      const p = n.properties as Record<string, unknown>
      const key = prayerKeyOf(p)
      return key && doneDatesOf(p).includes(date) ? [key] : []
    }),
  )
  const prayers: PrayerSlot[] = prayerTimesFor(settings, date, zoneFor(null, settings.timeZone, settings.timeZoneOverride))
    .map((t) => ({ ...t, done: prayed.has(t.key) }))

  const queue = buildNowQueue({
    date,
    tasks: of('Task'),
    events: of('Event'),
    timeBlocks: of('TimeBlock'),
    scheduledEdges,
    dueItems: nodes.filter((n) => dated.has(n.type)),
    prayers,
  })

  return {
    date,
    onTheClock: queue
      .filter((i) => i.startTime)
      .map((i) => ({
        start: i.startTime,
        end: i.endTime,
        what: i.children?.length ? `${i.label}: ${i.children.map((c) => c.name).join(', ')}` : i.label,
        kind: i.kind === 'block' ? (i.targetType ?? 'block').toLowerCase() : i.kind,
        ...(i.completed ? { done: true } : {}),
      })),
    stillNeedsATime: queue
      .filter((i) => !i.startTime)
      .map((i) => ({ what: i.label, kind: i.targetType?.toLowerCase() ?? i.kind, ...(i.note === 'overdue' ? { overdue: true } : {}) })),
  }
}
