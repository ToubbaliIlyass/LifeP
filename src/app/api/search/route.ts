import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, searchNodes } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'
import type { Node } from '@/lib/db/schema'

// Types that carry a dueDate/status pair "overdue" can mean something for.
const OVERDUE_TYPES = ['Task', 'Assignment', 'Exam']

function toResult(n: Node) {
  const p = n.properties as Record<string, unknown>
  const label =
    typeof p.name === 'string' ? p.name :
    typeof p.title === 'string' ? p.title :
    typeof p.label === 'string' ? p.label :
    typeof p.content === 'string' ? p.content.slice(0, 60) :
    `${n.type} #${n.id}`
  return { id: n.id, type: n.type, label }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const typeParam = searchParams.get('type')?.trim()
  const types = typeParam ? typeParam.split(',').filter(Boolean) : undefined
  const overdue = searchParams.get('overdue') === 'true'

  const user = getCurrentUser()

  // "Overdue" is a computed boolean (dueDate < today && not done), not text
  // — full-text search can't express it, so it's a separate mode. It can
  // still be combined with `type` (to scope which overdue things) and `q`
  // (to further text-filter within that set).
  if (overdue) {
    const today = todayStr()
    const candidateTypes = types && types.length > 0 ? types.filter((t) => OVERDUE_TYPES.includes(t)) : OVERDUE_TYPES
    const nodes = (await Promise.all(candidateTypes.map((t) => getNodes(user.id, { type: t })))).flat()
    const qLower = q?.toLowerCase()
    const overdueNodes = nodes.filter((n) => {
      const p = n.properties as Record<string, unknown>
      const status = typeof p.status === 'string' ? p.status : 'todo'
      const dueDate = typeof p.dueDate === 'string' ? p.dueDate : null
      if (status === 'done' || !dueDate || dueDate >= today) return false
      if (qLower && !JSON.stringify(p).toLowerCase().includes(qLower)) return false
      return true
    })
    return Response.json({ results: overdueNodes.slice(0, 40).map(toResult) })
  }

  if (!q || q.length < 2) return Response.json({ results: [] })

  const nodes = (await searchNodes(user.id, q, types)).slice(0, 20)
  return Response.json({ results: nodes.map(toResult) })
}
