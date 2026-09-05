import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createEdge, deleteEdge, findExistingEdge, getNodeById, getEdges } from '@/lib/graph/queries'

/**
 * Relationships as a first-class thing the user can edit.
 *
 * Until now edges could only be created by the AI or by a feature that
 * happened to make one (scheduling, adding a milestone). Connecting two
 * things you already have — this note is about that goal, this habit
 * supports it — had no path at all from the UI.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as {
    sourceId?: number
    targetId?: number
    type?: string
  }

  const { sourceId, targetId } = body
  const type = body.type?.trim()

  if (typeof sourceId !== 'number' || typeof targetId !== 'number' || !type) {
    return Response.json({ error: 'sourceId, targetId and type are required' }, { status: 400 })
  }
  if (sourceId === targetId) {
    return Response.json({ error: 'A node cannot be linked to itself' }, { status: 400 })
  }

  // Both ends must exist *and* belong to this user — otherwise an id guessed
  // from another account could be linked into this graph.
  const [source, target] = await Promise.all([
    getNodeById(user.id, sourceId),
    getNodeById(user.id, targetId),
  ])
  if (!source || !target) {
    return Response.json({ error: 'Node not found' }, { status: 404 })
  }

  const existing = await findExistingEdge(user.id, sourceId, targetId, type)
  if (existing) return Response.json({ ok: true, edge: existing, alreadyExisted: true })

  const edge = await createEdge(user.id, sourceId, targetId, type)
  return Response.json({ ok: true, edge })
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const id = parseInt(searchParams.get('id') ?? '', 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  // getEdges is already user-scoped, so an edge belonging to someone else is
  // simply not found here.
  const owned = (await getEdges(user.id)).some((e) => e.id === id)
  if (!owned) return Response.json({ error: 'Edge not found' }, { status: 404 })

  await deleteEdge(user.id, id)
  return Response.json({ ok: true })
}
