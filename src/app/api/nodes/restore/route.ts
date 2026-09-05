import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getNodeById } from '@/lib/graph/queries'

/**
 * Puts back a node that was just deleted, along with the edges cascaded away
 * with it.
 *
 * The node returns with a new id — the old one cannot be reused safely — so
 * each surviving edge is rewired to it. Edges whose *other* end has since been
 * deleted are skipped rather than failing the whole restore: getting the node
 * back matters more than recovering every link.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as {
    type?: string
    properties?: Record<string, unknown>
    /** Ids here refer to the deleted node, and are rewritten to its new id. */
    edges?: { sourceId: number; targetId: number; type: string; properties?: Record<string, unknown> }[]
    previousId?: number
  }

  if (!body.type) return Response.json({ error: 'type is required' }, { status: 400 })

  const node = await createNode(user.id, body.type, body.properties ?? {})

  let restoredEdges = 0
  for (const e of body.edges ?? []) {
    const sourceId = e.sourceId === body.previousId ? node.id : e.sourceId
    const targetId = e.targetId === body.previousId ? node.id : e.targetId

    const [src, tgt] = await Promise.all([
      sourceId === node.id ? node : getNodeById(user.id, sourceId),
      targetId === node.id ? node : getNodeById(user.id, targetId),
    ])
    if (!src || !tgt) continue

    await createEdge(user.id, sourceId, targetId, e.type, e.properties ?? {})
    restoredEdges++
  }

  return Response.json({ ok: true, node, restoredEdges })
}
