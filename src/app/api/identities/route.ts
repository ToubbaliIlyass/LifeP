import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createIdentity } from '@/lib/identity-write'
import { worldPayload } from '@/lib/world-data'

/** The identities with their counts, receipts and what is next, without the votes the world is drawn from. */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { identities, everyday, today } = await worldPayload(user.id, new URL(request.url).searchParams.get('tz'))
  return Response.json({ today, identities, everyday })
}

/** A new identity: who the user says they are becoming. Body: { name, listIds?, itemIds?, tags?, auto? } — what counts toward it, when already chosen; `auto` fills it in from their own lists when nothing was chosen. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (!name) return Response.json({ error: 'A name is needed' }, { status: 400 })

  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n)))] : [])
  const tags = Array.isArray(body.tags) ? [...new Set(body.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim()))] : []

  const { identity, created } = await createIdentity(user.id, name, { listIds: ids(body.listIds), itemIds: ids(body.itemIds), tags }, { auto: body.auto === true })
  return Response.json({ identity, created })
}
