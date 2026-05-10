import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'

function labelOf(p: Record<string, unknown>, id: number, type: string) {
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${type} #${id}`
}

export async function GET(request: Request) {
  const user = getCurrentUser()
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '30', 10)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + days)

  const events = getNodes(user.id, { type: 'Event' })
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        name: labelOf(p, n.id, 'Event'),
        date: typeof p.date === 'string' ? p.date : null,
        time: typeof p.time === 'string' ? p.time : null,
        duration: typeof p.duration === 'number' ? p.duration : null,
        location: typeof p.location === 'string' ? p.location : null,
        recurring: typeof p.recurring === 'string' ? p.recurring : 'none',
      }
    })
    .filter((e) => {
      if (!e.date) return false
      const d = new Date(e.date + 'T00:00:00')
      return d >= today && d <= cutoff
    })
    .sort((a, b) => (a.date! < b.date! ? -1 : 1))

  return Response.json({ events, from: today.toISOString().split('T')[0], days })
}
