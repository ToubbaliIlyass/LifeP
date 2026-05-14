import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges, getNodeById } from '@/lib/graph/queries'

export async function GET(request: Request) {
  const user = getCurrentUser()
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  // TimeBlocks for the requested date
  const allBlocks = getNodes(user.id, { type: 'TimeBlock' }).filter((n) => {
    const p = n.properties as Record<string, unknown>
    return p.date === date
  })

  // Find scheduled-for edges where source is one of our blocks
  const blockIds = new Set(allBlocks.map((b) => b.id))
  const scheduledEdges = getEdges(user.id, { type: 'scheduled-for' }).filter((e) =>
    blockIds.has(e.sourceId),
  )

  // Build sourceNodeId lookup: blockId -> sourceNodeId
  const sourceByBlock = new Map<number, number>()
  for (const edge of scheduledEdges) {
    sourceByBlock.set(edge.sourceId, edge.targetId)
  }

  // Fetch source nodes
  const sourceNodeIds = new Set(sourceByBlock.values())
  const sourceNodes = new Map<number, { id: number; type: string; name: string }>()
  for (const id of sourceNodeIds) {
    const node = getNodeById(user.id, id)
    if (node) {
      const p = node.properties as Record<string, unknown>
      sourceNodes.set(id, {
        id: node.id,
        type: node.type,
        name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${node.type} #${node.id}`,
      })
    }
  }

  const blocks = allBlocks.map((n) => {
    const p = n.properties as Record<string, unknown>
    const sourceNodeId = sourceByBlock.get(n.id)
    return {
      id: n.id,
      startTime: typeof p.startTime === 'string' ? p.startTime : '00:00',
      endTime: typeof p.endTime === 'string' ? p.endTime : '01:00',
      source: sourceNodeId ? sourceNodes.get(sourceNodeId) ?? null : null,
    }
  }).sort((a, b) => a.startTime.localeCompare(b.startTime))

  // Events for the requested date
  const events = getNodes(user.id, { type: 'Event' })
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        name: typeof p.name === 'string' ? p.name : `Event #${n.id}`,
        date: typeof p.date === 'string' ? p.date : null,
        time: typeof p.time === 'string' ? p.time : null,
        duration: typeof p.duration === 'number' ? p.duration : null,
        location: typeof p.location === 'string' ? p.location : null,
      }
    })
    .filter((e) => e.date === date)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  return Response.json({ date, blocks, events })
}
