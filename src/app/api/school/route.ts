import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, getEdges } from '@/lib/graph/queries'

function nameOf(p: Record<string, unknown>, id: number, type: string) {
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${type} #${id}`
}

export async function GET() {
  const user = getCurrentUser()

  const courses     = getNodes(user.id, { type: 'Course' })
  const assignments = getNodes(user.id, { type: 'Assignment' })
  const exams       = getNodes(user.id, { type: 'Exam' })
  const allEdges    = getEdges(user.id)

  // Build source → target map for quick lookup
  const edgeMap = new Map<number, number[]>()
  for (const e of allEdges) {
    const existing = edgeMap.get(e.sourceId) ?? []
    existing.push(e.targetId)
    edgeMap.set(e.sourceId, existing)
  }

  const result = courses.map((c) => {
    const cp = c.properties as Record<string, unknown>

    // Assignments linked via edge (Assignment → part-of → Course) or by courseNodeId property
    const linkedAssignments = assignments
      .filter((a) => {
        const ap = a.properties as Record<string, unknown>
        if (ap.courseNodeId === c.id) return true
        return edgeMap.get(a.id)?.includes(c.id)
      })
      .map((a) => {
        const p = a.properties as Record<string, unknown>
        return {
          id: a.id,
          name: nameOf(p, a.id, 'Assignment'),
          dueDate: typeof p.dueDate === 'string' ? p.dueDate : null,
          status: typeof p.status === 'string' ? p.status : 'todo',
          grade: typeof p.grade === 'string' ? p.grade : null,
        }
      })
      .sort((a, b) => (a.dueDate ?? 'z') < (b.dueDate ?? 'z') ? -1 : 1)

    // Exams linked similarly
    const linkedExams = exams
      .filter((e) => {
        const ep = e.properties as Record<string, unknown>
        if (ep.courseNodeId === c.id) return true
        return edgeMap.get(e.id)?.includes(c.id)
      })
      .map((e) => {
        const p = e.properties as Record<string, unknown>
        return {
          id: e.id,
          name: nameOf(p, e.id, 'Exam'),
          date: typeof p.date === 'string' ? p.date : null,
          time: typeof p.time === 'string' ? p.time : null,
          location: typeof p.location === 'string' ? p.location : null,
          status: typeof p.status === 'string' ? p.status : 'upcoming',
          grade: typeof p.grade === 'string' ? p.grade : null,
        }
      })
      .sort((a, b) => (a.date ?? 'z') < (b.date ?? 'z') ? -1 : 1)

    return {
      id: c.id,
      name: nameOf(cp, c.id, 'Course'),
      code: typeof cp.code === 'string' ? cp.code : null,
      semester: typeof cp.semester === 'string' ? cp.semester : null,
      assignments: linkedAssignments,
      exams: linkedExams,
    }
  })

  return Response.json({ courses: result })
}
