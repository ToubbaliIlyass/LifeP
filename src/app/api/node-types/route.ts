import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodeTypes } from '@/lib/db/node-types'

export async function GET() {
  const user = getCurrentUser()
  const types = getNodeTypes(user.id)
  return Response.json({ nodeTypes: types })
}
