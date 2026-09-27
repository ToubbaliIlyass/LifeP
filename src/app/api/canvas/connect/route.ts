import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import {
  canvasErrorMessage,
  clearCredential,
  normalizeBaseUrl,
  recordCanvasState,
  validateToken,
  writeCredential,
} from '@/lib/canvas'

/**
 * Connect Canvas: { baseUrl, token }.
 *
 * Nothing is stored until the token has actually been used, so a typo in
 * either field fails here rather than at the next sync.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as { baseUrl?: unknown; token?: unknown }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) {
    return Response.json({ error: 'Enter the address of your Canvas.' }, { status: 400 })
  }
  if (!token) return Response.json({ error: 'Paste an access token from Canvas.' }, { status: 400 })

  try {
    const baseUrl = normalizeBaseUrl(body.baseUrl)
    const identity = await validateToken(baseUrl, token)
    await writeCredential(user.id, {
      baseUrl,
      token,
      canvasUserId: identity.id,
      canvasUserName: identity.name,
    })
    await recordCanvasState(user.id, { enabled: true, baseUrl, lastError: null })
    return Response.json({ ok: true, baseUrl, canvasUserName: identity.name })
  } catch (e) {
    const error = canvasErrorMessage(e)
    // Recorded even though nothing was connected: the settings screen reads
    // this field, and a failed attempt is exactly what the user wants to see.
    await recordCanvasState(user.id, { lastError: error })
    return Response.json({ error }, { status: 400 })
  }
}

/**
 * Disconnect. The token goes; every Course, Assignment and Note that came
 * from Canvas stays, because by now they may be scheduled, linked and
 * annotated, and unplugging a source is not a request to lose a term's work.
 */
export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  await clearCredential(user.id)
  await recordCanvasState(user.id, { enabled: false, baseUrl: null, lastSync: null, lastError: null })
  return Response.json({ ok: true })
}
