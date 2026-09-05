import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, createNode, updateNode } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id: idStr } = await params
  const habitNodeId = parseInt(idStr, 10)
  if (isNaN(habitNodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json() as { completed: boolean; date?: string }
  const date = body.date ?? todayStr()

  // Find existing HabitLog for this habit + date
  const allLogs = await getNodes(user.id, { type: 'HabitLog' })
  const existing = allLogs.find((n) => {
    const p = n.properties as Record<string, unknown>
    return p.habitNodeId === habitNodeId && p.date === date
  })

  if (existing) {
    const updated = await updateNode(user.id, existing.id, {
      ...(existing.properties as Record<string, unknown>),
      completed: body.completed,
    })
    return Response.json({ ok: true, log: updated })
  }

  const log = await createNode(user.id, 'HabitLog', {
    habitNodeId,
    date,
    completed: body.completed,
  })
  return Response.json({ ok: true, log })
}
