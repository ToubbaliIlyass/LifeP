import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodeById, getNodes } from '@/lib/graph/queries'
import { blockStartFor, dowOf, loadAvailability, seriesOf, type ActivitySignal } from '@/lib/availability'
import { clockFor } from '@/lib/clock-server'
import { displayName } from '@/lib/graph/naming'
import { buildRhythm } from '@/lib/rhythm'

/**
 * When a to-do really gets done, for its rhythm chart (src/lib/rhythm.ts).
 * A habit, or a task — a repeating one's history is every time round.
 *
 * `tz` is the browser's zone, so "today" is the user's.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const node = await getNodeById(user.id, id)
  if (!node || (node.type !== 'Task' && node.type !== 'Habit')) return Response.json({ error: 'Not found' }, { status: 404 })

  const series = seriesOf(node)
  const clock = await clockFor(user.id, new URL(request.url).searchParams.get('tz'))
  const [signalNodes, availability, planned] = await Promise.all([
    getNodes(user.id, { type: 'ActivitySignal' }),
    loadAvailability(user.id),
    blockStartFor(user.id, id, clock.date),
  ])
  const signals = signalNodes
    .map((n) => n.properties as Partial<ActivitySignal>)
    .filter((s): s is ActivitySignal => s.itemId === series && typeof s.date === 'string')

  return Response.json(buildRhythm({
    today: clock.date,
    signals,
    planned,
    usual: availability.usualStart(series, displayName(node.type, node.properties as Record<string, unknown>), dowOf(clock.date)),
  }))
}
