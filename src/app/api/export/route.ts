import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges } from '@/lib/graph/queries'
import { getNodeTypes } from '@/lib/db/node-types'
import { todayStr } from '@/lib/date'

export async function GET() {
  const user = getCurrentUser()

  const nodes = await getNodes(user.id)
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
