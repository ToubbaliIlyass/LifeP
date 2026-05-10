import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { searchNodes } from '@/lib/graph/queries'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) return Response.json({ results: [] })

  const user = getCurrentUser()
  const nodes = searchNodes(user.id, q).slice(0, 20)

  const results = nodes.map((n) => {
    const p = n.properties as Record<string, unknown>
    const label =
      typeof p.name === 'string' ? p.name :
      typeof p.title === 'string' ? p.title :
      typeof p.content === 'string' ? p.content.slice(0, 60) :
      `${n.type} #${n.id}`
    return { id: n.id, type: n.type, label }
  })

  return Response.json({ results })
}
