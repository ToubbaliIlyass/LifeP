import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { removeDevice, saveDevice } from '@/lib/push-server'

/**
 * This device's push subscription: POST to turn reminders on here, DELETE
 * to turn them off. See src/lib/push-server.ts.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json().catch(() => null)) as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; label?: unknown } | null
  const s = body?.subscription
  if (typeof s?.endpoint !== 'string' || !s.endpoint.startsWith('https://') || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') {
    return Response.json({ error: 'Not a push subscription' }, { status: 400 })
  }
  await saveDevice(user.id, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, typeof body?.label === 'string' ? body.label : 'This device')
  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  if (typeof body?.endpoint === 'string') await removeDevice(user.id, body.endpoint)
  return Response.json({ ok: true })
}
