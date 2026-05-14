import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'

const STATUS_ORDER = ['todo', 'in-progress', 'done']
const ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000

export async function GET() {
  const user = getCurrentUser()
  const tasks = getNodes(user.id, { type: 'Task' })
  const now = Date.now()

  const result = tasks
    .map((t) => {
      const p = t.properties as Record<string, unknown>
      const status = typeof p.status === 'string' ? p.status : 'todo'
      const completedAt = typeof p.completedAt === 'string' ? p.completedAt : null
      const archived =
        status === 'done' &&
        completedAt !== null &&
        now - new Date(completedAt).getTime() > ARCHIVE_MS

      return {
        id: t.id,
        name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${t.id}`,
        status,
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
        completedAt,
        archived,
      }
    })
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

  return Response.json({ tasks: result })
}
