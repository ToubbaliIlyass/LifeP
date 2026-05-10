import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getPendingProposals } from '@/lib/db/proposals'

export async function GET() {
  const user = getCurrentUser()
  const pending = getPendingProposals(user.id)
  return Response.json({ proposals: pending })
}
