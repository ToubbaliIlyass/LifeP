import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges } from '@/lib/graph/queries'
import { getNodeTypes } from '@/lib/db/node-types'

export async function GET() {
  const user = getCurrentUser()

  const nodes = getNodes(user.id)
  const edges = getEdges(user.id)
  const nodeTypes = getNodeTypes(user.id)

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
      'Content-Disposition': `attachment; filename="lifep-${new Date().toISOString().split('T')[0]}.json"`,
    },
  })
}
