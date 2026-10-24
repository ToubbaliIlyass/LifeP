import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { deleteNode, getNodeById, updateNode } from '@/lib/graph/queries'
import { IDENTITY_COLORS, identityOf } from '@/lib/identity'

async function identityFor(userId: number, params: Promise<{ id: string }>) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return null
  const node = await getNodeById(userId, id)
  return node?.type === 'Identity' ? node : null
}

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n)))] : undefined)

/** Renames it, recolours it, or changes what counts toward it. Body: { name?, hue?, listIds?, itemIds?, tags? }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const node = await identityFor(user.id, params)
  if (!node) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const next = { ...(node.properties as Record<string, unknown>) }
  if (typeof body.name === 'string' && body.name.trim()) next.name = body.name.trim().slice(0, 80)
  if (Number.isInteger(body.hue) && (body.hue as number) >= 0 && (body.hue as number) < IDENTITY_COLORS.length) next.hue = body.hue
  const listIds = ids(body.listIds), itemIds = ids(body.itemIds)
  if (listIds) next.listIds = listIds
  if (itemIds) next.itemIds = itemIds
  if (Array.isArray(body.tags)) next.tags = [...new Set(body.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim()))]

  const updated = await updateNode(user.id, node.id, next)
  return Response.json({ identity: identityOf(updated ?? node) })
}

/** Forgets the identity. Its votes stay what they were — finished to-dos — and join the everyday. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const node = await identityFor(user.id, params)
  if (!node) return Response.json({ error: 'Not found' }, { status: 404 })
  await deleteNode(user.id, node.id)
  return Response.json({ ok: true })
}
