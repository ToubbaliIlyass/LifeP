import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getNodeById } from '@/lib/graph/queries'

/**
 * Commits the placements the user approved.
 *
 * Takes the exact times from the request rather than recomputing them: the
 * user approved a specific plan, and quietly writing a different one because
 * the clock moved between suggesting and approving would make approval
 * meaningless.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as {
    date?: string
    placements?: { taskId: number; startTime: string; endTime: string }[]
  }

  const date = body.date
  const placements = body.placements ?? []
  if (!date || placements.length === 0) {
    return Response.json({ error: 'date and placements are required' }, { status: 400 })
  }

  const created: { taskId: number; blockId: number }[] = []
  for (const p of placements) {
    const task = await getNodeById(user.id, p.taskId)
    if (!task) continue // deleted between suggesting and approving

    const block = await createNode(user.id, 'TimeBlock', {
      date,
      startTime: p.startTime,
      endTime: p.endTime,
      autoScheduled: true,
    })
    await createEdge(user.id, block.id, p.taskId, 'scheduled-for', {})
    created.push({ taskId: p.taskId, blockId: block.id })
  }

  return Response.json({ ok: true, created })
}
