import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { readCredential } from '@/lib/canvas'
import { moduleEnabled } from '@/lib/modules'
import { readSettings } from '@/lib/settings'

/**
 * Whether Canvas is connected, and how the last sync went.
 *
 * The token is never part of this — the settings screen has no use for it,
 * and it should not be sitting in a browser's network log.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [settings, cred] = await Promise.all([readSettings(user.id), readCredential(user.id)])

  return Response.json({
    connected: !!cred,
    enabled: settings.canvas.enabled,
    // The credential's copy wins: it is what a sync will actually call.
    baseUrl: cred?.baseUrl ?? settings.canvas.baseUrl,
    canvasUserName: cred?.canvasUserName ?? null,
    lastSync: settings.canvas.lastSync,
    lastError: settings.canvas.lastError,
    lastSummary: cred?.lastSummary ?? null,
    schoolEnabled: moduleEnabled(settings, 'school'),
  })
}
