import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges } from '@/lib/graph/queries'
import { todayStr, eventOccursOn, addDays } from '@/lib/date'
import { hiddenTypes } from '@/lib/modules'
import { buildSessions } from '@/lib/sessions'
import type { Node } from '@/lib/db/schema'

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** A month view with its leading and trailing weeks. */
const MAX_DAYS = 42

const labelOf = (n: Node) => {
  const p = n.properties as Record<string, unknown>
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${n.type} #${n.id}`
}

/**
 * GET ?date=YYYY-MM-DD           → { date, blocks, events }  (one day; unchanged shape)
 * GET ?from=YYYY-MM-DD&to=…      → { days: [{ date, blocks, events }] }
 *
 * The range form exists for the calendar, which asks for whatever the current
 * view spans in one request instead of one request per day.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const isRange = !!(from && to && DATE.test(from) && DATE.test(to) && from <= to)

  const dates: string[] = []
  if (isRange) {
    for (let d = from!; d <= to! && dates.length < MAX_DAYS; d = addDays(d, 1)) dates.push(d)
  } else {
    const date = searchParams.get('date')
    dates.push(date && DATE.test(date) ? date : todayStr())
  }

  const nodes = await getNodes(user.id)
  const settings = (nodes.find((n) => n.type === 'Settings')?.properties ?? {}) as {
    workingHours?: { start: string; end: string }
    modules?: Record<string, boolean>
    timeZone?: string | null
  }

  // Reading the calendar never writes to it. An "auto" mode used to plan
  // whatever days were on screen as a side effect of looking at them; the
  // day is now planned when something is captured or Plan / Replan is
  // pressed, all through replanDay (src/lib/schedule-day.ts).

  // Everything is loaded once and sliced per day in memory: a month is 42
  // days, and 42 rounds of queries over the network would be felt.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Every target, not just one: a block may hold a whole batch of tasks.
  // This used to be `new Map(edges.map(...))`, which silently kept the last
  // edge per block and dropped the rest — see src/lib/sessions.ts.
  const scheduledEdges = await getEdges(user.id, { type: 'scheduled-for' })
  const habitLogs = nodes.filter((n) => n.type === 'HabitLog')
  // Every block is offered to every day in view and asked whether it falls
  // there — a routine is one block that occurs all week, so it cannot be
  // bucketed by its own date. buildSessions does the asking.
  const allBlocks = nodes.filter((n) => n.type === 'TimeBlock')
  const eventNodes = nodes.filter((n) => n.type === 'Event')
  // Content hub: pieces with a publish time, only while the module is on.
  const off = hiddenTypes(settings)
  const pieces = off.has('ContentPiece') ? [] : nodes.filter((n) => n.type === 'ContentPiece')

  const days = dates.map((date) => {
    const blocks = buildSessions({ blocks: allBlocks, edges: scheduledEdges, byId, habitLogs, date })

    const events: {
      id: number; kind: 'event' | 'content'; name: string; date: string
      time: string | null; duration: number | null; location: string | null; recurring: boolean
    }[] = eventNodes
      .filter((n) => {
        const p = n.properties as Record<string, unknown>
        return eventOccursOn(
          {
            date: typeof p.date === 'string' ? p.date : null,
            frequency: typeof p.frequency === 'string' ? p.frequency : null,
            daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
            until: typeof p.until === 'string' ? p.until : null,
          },
          date,
        )
      })
      .map((n) => {
        const p = n.properties as Record<string, unknown>
        return {
          id: n.id,
          kind: 'event' as const,
          name: labelOf(n),
          // The occurrence, not the rule's start date — this is the day being shown.
          date,
          time: typeof p.time === 'string' ? p.time : null,
          duration: typeof p.duration === 'number' ? p.duration : null,
          location: typeof p.location === 'string' ? p.location : null,
          recurring: typeof p.frequency === 'string' && p.frequency !== 'once' && p.frequency !== 'none',
        }
      })

    for (const n of pieces) {
      const p = n.properties as Record<string, unknown>
      if (p.publishDate !== date || typeof p.publishTime !== 'string') continue
      events.push({
        id: n.id,
        kind: 'content',
        name: `▶ ${labelOf(n)}`,
        date,
        time: p.publishTime,
        duration: 30,
        location: typeof p.platform === 'string' ? p.platform : null,
        recurring: false,
      })
    }
    events.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

    return { date, blocks, events }
  })

  return Response.json(isRange ? { days } : days[0])
}
