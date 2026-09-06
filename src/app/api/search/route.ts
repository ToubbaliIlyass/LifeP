import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { searchNodes } from '@/lib/graph/queries'
import type { Node } from '@/lib/db/schema'

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

/**
 * Plain text search across everything.
 *
 * Type and overdue filters lived here to serve filter chips in the UI. Those
 * are gone — the search box narrows well enough on its own — so the
 * parameters went with them rather than lingering as untested dead paths.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json({ results: [] })

  const nodes = (await searchNodes(user.id, q)).slice(0, 25)
  return Response.json({ results: nodes.map(toResult) })
}
