import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getPendingProposals } from '@/lib/db/proposals'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const pending = await getPendingProposals(user.id)
  return Response.json({ proposals: pending })
}
