import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodeTypes } from '@/lib/db/node-types'
import { hiddenTypes } from '@/lib/modules'
import { readSettings } from '@/lib/settings'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  // The graph's filter chips are built from this, so a switched-off module
  // must not appear here either.
  const off = hiddenTypes(await readSettings(user.id))
  const types = (await getNodeTypes(user.id)).filter((t) => !off.has(t.name))
  return Response.json({ nodeTypes: types })
}
