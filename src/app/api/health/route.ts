import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, getNodes } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Values arrive from a number input, so "72.5" is as likely as 72.5. */
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const parsed = Number(v)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface HealthMetric {
  id: number
  label: string
  value: number | null
  unit: string | null
  date: string
  createdAt: string
}

/**
 * Metrics are returned flat, newest first, and grouped by label in the panel.
 *
 * Grouping server-side would mean picking the grouping key here and re-picking
 * it the moment the panel wants a different one; the whole set is a handful of
 * rows per person, so the client can slice it however it likes.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const metrics: HealthMetric[] = (await getNodes(user.id, { type: 'HealthMetric' }))
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        label: str(p.label) ?? str(p.name) ?? `Metric #${n.id}`,
        value: num(p.value),
        unit: str(p.unit),
        // Undated points would vanish from every chart and sort last forever;
        // falling back to the creation day keeps them on the timeline.
        date: str(p.date) ?? n.createdAt.slice(0, 10),
        createdAt: n.createdAt,
      }
    })
    // Same-day entries are ordered by id so the newest logged one reads first.
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  return Response.json({ metrics })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json()) as Record<string, unknown>

  const label = str(body.label)
  if (!label) return Response.json({ error: 'A metric needs a label' }, { status: 400 })

  const value = num(body.value)
  if (value === null) return Response.json({ error: 'A metric needs a numeric value' }, { status: 400 })

  const date = str(body.date)
  if (date && !DATE_RE.test(date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  const node = await createNode(user.id, 'HealthMetric', {
    // Labels are the grouping key, so "Weight" and "weight" must not become
    // two separate series.
    label: label.toLowerCase(),
    value,
    unit: str(body.unit) ?? undefined,
    date: date ?? todayStr(),
  })

  return Response.json({ ok: true, id: node.id })
}
