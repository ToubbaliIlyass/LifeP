import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { worldPayload } from '@/lib/world-data'

/**
 * Everything the world and the identity page are drawn from: the identities,
 * every vote ever cast for them, the receipts behind them and what is next
 * (see src/lib/identity.ts). Read fresh each time from the finished to-dos
 * themselves, so it can never drift from the lists.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  return Response.json(await worldPayload(user.id, new URL(request.url).searchParams.get('tz')))
}
