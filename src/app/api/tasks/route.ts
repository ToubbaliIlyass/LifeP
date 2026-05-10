import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'

const STATUS_ORDER = ['todo', 'in-progress', 'done']

export async function GET() {
  const user = getCurrentUser()
  const tasks = getNodes(user.id, { type: 'Task' })

  const result = tasks
    .map((t) => {
      const p = t.properties as Record<string, unknown>
      return {
        id: t.id,
        name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${t.id}`,
        status: typeof p.status === 'string' ? p.status : 'todo',
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
      }
    })
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

  return Response.json({ tasks: result })
}
