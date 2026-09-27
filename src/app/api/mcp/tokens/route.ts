import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, deleteNode, getNodeById, getNodes } from '@/lib/graph/queries'
import { generateToken, hashToken } from '@/lib/mcp/auth'

/** Personal access tokens for the MCP endpoint. Session-authenticated: managed from Settings. */

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const tokens = (await getNodes(user.id, { type: 'ApiToken' })).map((n) => {
    const p = n.properties as Record<string, unknown>
    // Never the hash — the list only needs enough to recognise a token.
    return { id: n.id, name: p.name ?? 'Token', preview: p.preview ?? '', createdAt: n.createdAt, lastUsedAt: p.lastUsedAt ?? null }
  })
  return Response.json({ tokens })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json().catch(() => ({}))) as { name?: unknown }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : 'Chatbot'

  const token = generateToken()
  const node = await createNode(user.id, 'ApiToken', {
    name,
    hash: hashToken(token),
    preview: `${token.slice(0, 11)}…${token.slice(-4)}`,
  })
  // The only time the token itself is ever returned.
  return Response.json({ ok: true, id: node.id, token })
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = Number(new URL(request.url).searchParams.get('id'))
  const node = Number.isInteger(id) ? await getNodeById(user.id, id) : undefined
  if (!node || node.type !== 'ApiToken') return Response.json({ error: 'Not found' }, { status: 404 })
  await deleteNode(user.id, id)
  return Response.json({ ok: true })
}
