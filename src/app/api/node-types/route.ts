import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodeTypes } from '@/lib/db/node-types'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const types = await getNodeTypes(user.id)
  return Response.json({ nodeTypes: types })
}
