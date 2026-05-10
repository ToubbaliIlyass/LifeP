import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, createNode, updateNode } from '@/lib/graph/queries'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getCurrentUser()
  const { id: idStr } = await params
  const habitNodeId = parseInt(idStr, 10)
  if (isNaN(habitNodeId)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json() as { completed: boolean; date?: string }
  const date = body.date ?? todayStr()

  // Find existing HabitLog for this habit + date
  const allLogs = getNodes(user.id, { type: 'HabitLog' })
  const existing = allLogs.find((n) => {
    const p = n.properties as Record<string, unknown>
    return p.habitNodeId === habitNodeId && p.date === date
  })

  if (existing) {
    const updated = updateNode(user.id, existing.id, {
      ...(existing.properties as Record<string, unknown>),
      completed: body.completed,
    })
    return Response.json({ ok: true, log: updated })
  }

  const log = createNode(user.id, 'HabitLog', {
    habitNodeId,
    date,
    completed: body.completed,
  })
  return Response.json({ ok: true, log })
}
