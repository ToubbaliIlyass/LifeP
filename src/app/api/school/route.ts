import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import {
  createEdge,
  createNode,
  deleteEdge,
  getEdges,
  getNodeById,
  getNodes,
  updateNode,
} from '@/lib/graph/queries'
import type { Node } from '@/lib/db/schema'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

// Kept local rather than exported: a route module that exports anything other
// than handlers trips Next's route type checking.
const ASSIGNMENT_STATUSES = ['todo', 'submitted', 'graded'] as const
const EXAM_STATUSES = ['upcoming', 'taken', 'graded'] as const

function nameOf(p: Record<string, unknown>, id: number, type: string) {
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `${type} #${id}`
}

/**
 * The course an assignment or exam belongs to.
 *
 * Two sources have to agree: the `courseNodeId` property the hub reads and the
 * 'part-of' edge the graph and the assistant see. They can disagree — the AI
 * has written one without the other — so the property wins and the edge is
 * only a fallback, which keeps a hand-edited link authoritative.
 */
function courseIdFor(node: Node, courseIds: Set<number>, edgeTargets: Map<number, number[]>): number | null {
  const p = node.properties as Record<string, unknown>
  const byProp = num(p.courseNodeId)
  if (byProp !== null && courseIds.has(byProp)) return byProp
  return edgeTargets.get(node.id)?.find((t) => courseIds.has(t)) ?? null
}

function assignmentRow(n: Node, courseId: number | null) {
  const p = n.properties as Record<string, unknown>
  const status = str(p.status) ?? 'todo'
  return {
    id: n.id,
    name: nameOf(p, n.id, 'Assignment'),
    courseId,
    dueDate: str(p.dueDate),
    status: (ASSIGNMENT_STATUSES as readonly string[]).includes(status) ? status : 'todo',
    grade: str(p.grade),
  }
}

function examRow(n: Node, courseId: number | null) {
  const p = n.properties as Record<string, unknown>
  const status = str(p.status) ?? 'upcoming'
  return {
    id: n.id,
    name: nameOf(p, n.id, 'Exam'),
    courseId,
    date: str(p.date),
    time: str(p.time),
    location: str(p.location),
    status: (EXAM_STATUSES as readonly string[]).includes(status) ? status : 'upcoming',
    grade: str(p.grade),
  }
}

const byDate = (a: string | null, b: string | null) => (a ?? '9999').localeCompare(b ?? '9999')

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [courseNodes, assignmentNodes, examNodes, allEdges] = await Promise.all([
    getNodes(user.id, { type: 'Course' }),
    getNodes(user.id, { type: 'Assignment' }),
    getNodes(user.id, { type: 'Exam' }),
    getEdges(user.id),
  ])

  const courseIds = new Set(courseNodes.map((c) => c.id))
  const edgeTargets = new Map<number, number[]>()
  for (const e of allEdges) {
    edgeTargets.set(e.sourceId, [...(edgeTargets.get(e.sourceId) ?? []), e.targetId])
  }

  const assignments = assignmentNodes
    .map((a) => assignmentRow(a, courseIdFor(a, courseIds, edgeTargets)))
    .sort((a, b) => byDate(a.dueDate, b.dueDate) || a.id - b.id)
  const exams = examNodes
    .map((e) => examRow(e, courseIdFor(e, courseIds, edgeTargets)))
    .sort((a, b) => byDate(a.date, b.date) || a.id - b.id)

  const courses = courseNodes
    .map((c) => {
      const p = c.properties as Record<string, unknown>
      return {
        id: c.id,
        name: nameOf(p, c.id, 'Course'),
        code: str(p.code),
        semester: str(p.semester),
        credits: num(p.credits),
        assignments: assignments.filter((a) => a.courseId === c.id),
        exams: exams.filter((e) => e.courseId === c.id),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // Items with no course at all are returned too, rather than silently dropped
  // as they were: without them there is nowhere to attach a course from.
  return Response.json({
    courses,
    unassigned: {
      assignments: assignments.filter((a) => a.courseId === null),
      exams: exams.filter((e) => e.courseId === null),
    },
  })
}

/** Point `itemId` at `courseId` (or at nothing), property and edge together. */
async function relinkCourse(userId: number, itemId: number, props: Record<string, unknown>, courseId: number | null) {
  const course = courseId === null ? null : await getNodeById(userId, courseId)
  if (courseId !== null && course?.type !== 'Course') return false

  // Only course links are cleared. An assignment may be 'part-of' something
  // else entirely (a project, a goal) and changing its course must not quietly
  // cut those loose.
  for (const e of await getEdges(userId, { sourceId: itemId, type: 'part-of' })) {
    if (e.targetId === course?.id) continue
    const target = await getNodeById(userId, e.targetId)
    if (target?.type === 'Course') await deleteEdge(userId, e.id)
  }
  props.courseNodeId = course ? course.id : undefined

  if (course) {
    const existing = await getEdges(userId, { sourceId: itemId, targetId: course.id, type: 'part-of' })
    if (existing.length === 0) await createEdge(userId, itemId, course.id, 'part-of')
  }
  return true
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json()) as Record<string, unknown>

  const name = str(body.name)
  if (!name) return Response.json({ error: 'A name is required' }, { status: 400 })

  if (body.kind === 'course') {
    const node = await createNode(user.id, 'Course', {
      name,
      code: str(body.code) ?? undefined,
      semester: str(body.semester) ?? undefined,
      credits: num(body.credits) ?? undefined,
    })
    return Response.json({ ok: true, id: node.id })
  }

  if (body.kind === 'assignment' || body.kind === 'exam') {
    const isExam = body.kind === 'exam'
    const status = str(body.status)
    const allowed: readonly string[] = isExam ? EXAM_STATUSES : ASSIGNMENT_STATUSES
    const props: Record<string, unknown> = isExam
      ? {
          name,
          date: str(body.date) ?? undefined,
          time: str(body.time) ?? undefined,
          location: str(body.location) ?? undefined,
          status: status && allowed.includes(status) ? status : 'upcoming',
        }
      : {
          name,
          dueDate: str(body.dueDate) ?? undefined,
          status: status && allowed.includes(status) ? status : 'todo',
        }

    const node = await createNode(user.id, isExam ? 'Exam' : 'Assignment', props)
    const courseId = num(body.courseId)
    if (courseId !== null) {
      const linked = await relinkCourse(user.id, node.id, props, courseId)
      if (linked) await updateNode(user.id, node.id, props)
    }
    return Response.json({ ok: true, id: node.id })
  }

  return Response.json({ error: 'kind must be "course", "assignment" or "exam"' }, { status: 400 })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id, ...changes } = (await request.json()) as Record<string, unknown> & { id?: number }
  if (typeof id !== 'number') return Response.json({ error: 'id required' }, { status: 400 })

  const node = await getNodeById(user.id, id)
  if (!node || !['Course', 'Assignment', 'Exam'].includes(node.type)) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const props = { ...(node.properties as Record<string, unknown>) }

  if ('status' in changes) {
    const allowed: readonly string[] = node.type === 'Exam' ? EXAM_STATUSES : ASSIGNMENT_STATUSES
    const status = str(changes.status)
    if (node.type === 'Course' || !status || !allowed.includes(status)) {
      return Response.json({ error: 'Unknown status' }, { status: 400 })
    }
    props.status = status
    // A grade only means anything once something is graded; dropping back to
    // an earlier status without clearing it would leave a mark on work that
    // is, as far as the list is concerned, not marked yet.
    if (status !== 'graded') props.grade = undefined
  }

  for (const key of ['name', 'code', 'semester', 'dueDate', 'date', 'time', 'location', 'grade'] as const) {
    if (key in changes) props[key] = str(changes[key]) ?? undefined
  }
  if ('credits' in changes) props.credits = num(changes.credits) ?? undefined

  if ('courseId' in changes && node.type !== 'Course') {
    const ok = await relinkCourse(user.id, id, props, num(changes.courseId))
    if (!ok) return Response.json({ error: 'Course not found' }, { status: 404 })
  }

  await updateNode(user.id, id, props)
  return Response.json({ ok: true })
}
