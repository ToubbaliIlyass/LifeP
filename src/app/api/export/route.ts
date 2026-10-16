import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges } from '@/lib/graph/queries'
import { getNodeTypes } from '@/lib/db/node-types'
import { todayStr } from '@/lib/date'
/** Left behind by the Canvas integration, now removed; still never exported. */
const CANVAS_CREDENTIAL_TYPE = 'CanvasCredential'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // The Canvas access token is a live credential for the user's university
  // account. An export is a file that gets emailed, backed up and dropped
  // into other tools, which is the last place it belongs.
  const nodes = (await getNodes(user.id)).filter((n) => n.type !== CANVAS_CREDENTIAL_TYPE)
  const edges = await getEdges(user.id)
  const nodeTypes = await getNodeTypes(user.id)

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId: user.id,
    nodes,
    edges,
    nodeTypes,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="lifep-${todayStr()}.json"`,
    },
  })
}
