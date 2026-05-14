import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge } from '@/lib/graph/queries'

export async function POST(request: Request) {
  const user = getCurrentUser()
  const body = await request.json() as {
    date: string
    startTime: string
    endTime: string
    sourceNodeId?: number
  }

  const block = createNode(user.id, 'TimeBlock', {
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
  })

  if (body.sourceNodeId) {
    createEdge(user.id, block.id, body.sourceNodeId, 'scheduled-for', {})
  }

  return Response.json({ ok: true, block })
}
