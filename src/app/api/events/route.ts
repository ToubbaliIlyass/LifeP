import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'
import { localDateStr, addDays, eventOccursOn } from '@/lib/date'

function labelOf(p: Record<string, unknown>, id: number, type: string) {
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${type} #${id}`
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '30', 10)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + days)

  const from = localDateStr(today)
  const to = localDateStr(cutoff)

  // A recurring event is one node, so it is expanded into one entry per day
  // it actually falls on inside the window. `id` stays the node's id — that
  // is what editing and deleting act on — while `date` is the occurrence, so
  // callers that group by day keep working unchanged.
  const events = (await getNodes(user.id, { type: 'Event' })).flatMap((n) => {
    const p = n.properties as Record<string, unknown>
    const rule = {
      date: typeof p.date === 'string' ? p.date : null,
      frequency: typeof p.frequency === 'string' ? p.frequency : null,
      daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
      until: typeof p.until === 'string' ? p.until : null,
    }
    if (!rule.date) return []

    const base = {
      id: n.id,
      name: labelOf(p, n.id, 'Event'),
      time: typeof p.time === 'string' ? p.time : null,
      duration: typeof p.duration === 'number' ? p.duration : null,
      location: typeof p.location === 'string' ? p.location : null,
      frequency: rule.frequency ?? 'once',
      daysOfWeek: rule.daysOfWeek,
      until: rule.until,
    }

    const out: (typeof base & { date: string; recurring: boolean })[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (eventOccursOn(rule, d)) {
        out.push({ ...base, date: d, recurring: base.frequency !== 'once' })
      }
    }
    return out
  })

  events.sort((a, b) => (a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date < b.date ? -1 : 1))

  return Response.json({ events, from, days })
}
