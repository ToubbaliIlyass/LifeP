import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, createNode, deleteNode } from '@/lib/graph/queries'

interface SavedQuery {
  q?: string
  types?: string[]
  overdue?: boolean
}

// SavedView nodes are a "system" type like TimeBlock — hidden from the
// Graph (see HIDDEN_TYPES in src/lib/graph/layout.ts), just a place to
// park a named filter for one-tap reuse from the search bar.
export async function GET() {
  const user = getCurrentUser()
  const nodes = getNodes(user.id, { type: 'SavedView' })
  const views = nodes.map((n) => {
    const p = n.properties as { name?: string; query?: SavedQuery }
    return { id: n.id, name: p.name ?? `View #${n.id}`, query: p.query ?? {} }
  })
  return Response.json({ views })
}

export async function POST(request: Request) {
  const user = getCurrentUser()
  const body = await request.json() as { name?: string; query?: SavedQuery }
  const name = body.name?.trim()
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })

  const node = createNode(user.id, 'SavedView', { name, query: body.query ?? {} })
  return Response.json({ ok: true, view: { id: node.id, name, query: body.query ?? {} } })
}

export async function DELETE(request: Request) {
  const user = getCurrentUser()
  const { searchParams } = new URL(request.url)
  const id = parseInt(searchParams.get('id') ?? '', 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
  deleteNode(user.id, id)
  return Response.json({ ok: true })
}
