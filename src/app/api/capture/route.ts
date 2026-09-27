import { generateText, Output } from 'ai'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, getNodes, getNodeById, updateNode } from '@/lib/graph/queries'
import { defaultModel } from '@/lib/ai/client'
import { readSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { addDays } from '@/lib/date'
import { fromMinutes } from '@/lib/schedule'
import { replanDay } from '@/lib/schedule-day'
import { CaptureSchema, toCaptureNodes, fallbackCapture, type CaptureNode } from '@/lib/capture'
import { logger } from '@/lib/log'

/** Days ahead a capture replans. Further out is planned when it gets closer. */
const REPLAN_DAYS = 7

/**
 * Say it, and it is on your day.
 *
 * One sentence in — typed or spoken, as loose as it comes out — and back
 * comes what was added and where each thing now sits. The model only reads
 * the sentence (src/lib/capture.ts decides everything written); the day is
 * then replanned by the same planner as the Plan button, so the answer is
 * the calendar, not a to-do list the user still has to schedule.
 *
 * Body: { text, tz? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { text?: unknown; tz?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : ''
  if (!text) return Response.json({ error: 'Nothing to capture' }, { status: 400 })

  const settings = await readSettings(user.id)
  const clock = clockIn(zoneFor(typeof body.tz === 'string' ? body.tz : null, settings.timeZone))
  const openTasks = (await getNodes(user.id, { type: 'Task' }))
    .filter((t) => (t.properties as Record<string, unknown>).status !== 'done')
    .map((t) => ({ id: t.id, name: String((t.properties as Record<string, unknown>).name ?? '') }))
    .filter((t) => t.name)

  let nodes: CaptureNode[]
  let read: 'ai' | 'fallback' = 'ai'
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    const weekday = new Date(clock.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
    const { output } = await generateText({
      model: defaultModel,
      system: [
        'You read what someone says needs to happen and list the items. Nothing else.',
        `Today is ${weekday} ${clock.date}; it is ${fromMinutes(clock.minutes)} where they are. Resolve "tomorrow", "Friday", "tonight" from that.`,
        'One item per thing to do or thing happening. Do not split one errand into steps, and do not invent anything they did not say.',
        'An event has a fixed time (appointment, class, meeting, call booked for a time). Anything else is a task, even if they said roughly when.',
        'Keep names short, the way they would write them on a list, without the date or time in them.',
      ].join('\n'),
      prompt: text,
      output: Output.object({ schema: CaptureSchema }),
    })
    nodes = toCaptureNodes(output.items, { today: clock.date, openTasks })
    // Read, but nothing came out of it — keep what was said rather than nothing.
    if (nodes.length === 0) { nodes = fallbackCapture(text, clock.date); read = 'fallback' }
  } catch (error) {
    logger.warn('capture_read_failed', { message: error instanceof Error ? error.message : String(error) })
    nodes = fallbackCapture(text, clock.date)
    read = 'fallback'
  }

  const added: { id: number; type: string; name: string; date: string; time?: string; moved?: boolean }[] = []
  for (const node of nodes) {
    const p = node.properties
    const date = String(node.type === 'Event' ? p.date : p.dueDate)
    if (node.existingId !== undefined) {
      // Already on the list: it moves to the day just said, keeping its own
      // estimate and everything else about it.
      const existing = await getNodeById(user.id, node.existingId)
      if (existing) {
        await updateNode(user.id, existing.id, {
          ...(existing.properties as Record<string, unknown>),
          dueDate: p.dueDate,
          ...(p.priority ? { priority: p.priority } : {}),
        })
        added.push({ id: existing.id, type: 'Task', name: String(p.name), date, moved: true })
        continue
      }
    }
    const created = await createNode(
      user.id,
      node.type,
      node.type === 'Task' ? { status: 'todo', priority: 'medium', ...p } : p,
    )
    added.push({
      id: created.id,
      type: node.type,
      name: String(p.name),
      date,
      ...(node.type === 'Event' ? { time: String(p.time) } : {}),
    })
  }

  // Every day something landed on, this week, planned again around it.
  const last = addDays(clock.date, REPLAN_DAYS - 1)
  const dates = [...new Set(added.map((a) => a.date))].filter((d) => d >= clock.date && d <= last).sort()
  const plans = []
  for (const date of dates) {
    const r = await replanDay(user.id, date, clock)
    plans.push({
      date,
      planned: r.placements.map((p) => ({ taskId: p.taskId, start: p.startTime, end: p.endTime, name: p.name })),
      unplaced: r.unplaced.map((u) => ({ taskId: u.taskId, name: u.name, reason: u.reason })),
    })
  }

  return Response.json({ ok: true, read, added, plans })
}
