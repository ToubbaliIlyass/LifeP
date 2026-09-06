import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges, getNodeById, createNode, createEdge } from '@/lib/graph/queries'
import { todayStr, eventOccursOn } from '@/lib/date'
import { planDay } from '@/lib/schedule-day'
import { DEFAULT_DAY } from '@/lib/schedule'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? todayStr()

  // Today or any future day — never a past one, so browsing history never
  // fabricates an entry that wasn't actually there.
  if (date >= todayStr()) {
    const settingsNodes = await getNodes(user.id, { type: 'Settings' })
    const settings = (settingsNodes[0]?.properties ?? {}) as {
      scheduleMode?: 'off' | 'suggest' | 'auto'
      workingHours?: { start: string; end: string }
    }
    const hours = settings.workingHours ?? DEFAULT_DAY

    // Only "auto" writes without asking; it now covers habits as well as
    // tasks. Habits used to be stamped onto every day regardless of this
    // setting, at a hardcoded time outside the working day and with no
    // approval — which is how one morning collected eight overlapping
    // blocks. In "suggest" mode the same plan is offered on the dashboard
    // and waits to be accepted; both paths go through planDay, so what is
    // approved is what gets written.
    if (settings.scheduleMode === 'auto') {
      const placements = await planDay(user.id, date, hours)
      for (const p of placements) {
        const block = await createNode(user.id, 'TimeBlock', {
          date,
          startTime: p.startTime,
          endTime: p.endTime,
          autoScheduled: true,
        })
        await createEdge(user.id, block.id, p.taskId, 'scheduled-for', {})
      }
    }
  }

  // TimeBlocks for the requested date
  const allBlocks = (await getNodes(user.id, { type: 'TimeBlock' })).filter((n) => {
    const p = n.properties as Record<string, unknown>
    return p.date === date
  })

  // Find scheduled-for edges where source is one of our blocks
  const blockIds = new Set(allBlocks.map((b) => b.id))
  const scheduledEdges = (await getEdges(user.id, { type: 'scheduled-for' })).filter((e) =>
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
    const node = await getNodeById(user.id, id)
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
  const events = (await getNodes(user.id, { type: 'Event' }))
    .filter((n) => {
      const p = n.properties as Record<string, unknown>
      return eventOccursOn(
        {
          date: typeof p.date === 'string' ? p.date : null,
          frequency: typeof p.frequency === 'string' ? p.frequency : null,
          daysOfWeek: Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
          until: typeof p.until === 'string' ? p.until : null,
        },
        date,
      )
    })
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        name: typeof p.name === 'string' ? p.name : `Event #${n.id}`,
        // The occurrence, not the rule's start date — this is the day being shown.
        date,
        time: typeof p.time === 'string' ? p.time : null,
        duration: typeof p.duration === 'number' ? p.duration : null,
        location: typeof p.location === 'string' ? p.location : null,
        recurring: typeof p.frequency === 'string' && p.frequency !== 'once' && p.frequency !== 'none',
      }
    })
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  return Response.json({ date, blocks, events })
}
