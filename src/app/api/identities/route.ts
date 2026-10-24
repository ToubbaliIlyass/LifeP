import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, getNodes } from '@/lib/graph/queries'
import { identityOf, nextHue } from '@/lib/identity'

/** A new identity: who the user says they are becoming. Body: { name }. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (!name) return Response.json({ error: 'A name is needed' }, { status: 400 })

  const existing = (await getNodes(user.id, { type: 'Identity' })).map(identityOf)
  const node = await createNode(user.id, 'Identity', {
    name,
    hue: nextHue(existing),
    listIds: [],
    itemIds: [],
    tags: [],
    order: existing.reduce((m, i) => Math.max(m, i.order), 0) + 1,
  })
  return Response.json({ identity: identityOf(node) })
}
