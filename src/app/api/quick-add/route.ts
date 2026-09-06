import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getNodeById } from '@/lib/graph/queries'

// The user's own direct capture — never gated by the AI proposal queue,
// same tier as toggling a habit or editing a field in NodeDetailPanel. This
// intentionally covers types the AI itself must use batchPropose for
// (Goal/Habit/Project/Course/Exam/Assignment, see ALWAYS_PROPOSE_TYPES in
// src/lib/ai/tools.ts) — that restriction exists to put a human check on
// *AI-initiated* structural changes, which doesn't apply when the human is
// the one directly creating it. Allow-listed server-side so this can't be
// used to smuggle in arbitrary node types.
const ALLOWED_TYPES = new Set([
  'Task', 'Note', 'Event', 'HealthMetric',
  'Goal', 'Habit', 'Project', 'Course', 'Exam', 'Assignment',
])

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = await request.json() as {
    type?: string
    properties?: Record<string, unknown>
    /** Optional Goal/Project/Course this belongs to. */
    linkTo?: number | null
  }

  const type = body.type
  if (!type || !ALLOWED_TYPES.has(type)) {
    return Response.json({ error: `type must be one of ${[...ALLOWED_TYPES].join(', ')}` }, { status: 400 })
  }

  const properties = body.properties ?? {}
  // The identity field differs by type (Note uses `title`, HealthMetric
  // uses `label`, everything else uses `name`) — accept whichever applies.
  const identity = properties.name ?? properties.title ?? properties.label
  if (typeof identity !== 'string' || !identity.trim()) {
    return Response.json({ error: 'a name/title/label is required' }, { status: 400 })
  }

  const node = await createNode(user.id, type, properties)

  // Linking is best-effort: capture already succeeded, and losing the note
  // itself because a parent was deleted a moment ago would be a poor trade.
  let linkedTo: number | null = null
  if (typeof body.linkTo === 'number') {
    const parent = await getNodeById(user.id, body.linkTo)
    if (parent && ['Goal', 'Project', 'Course'].includes(parent.type)) {
      await createEdge(user.id, node.id, parent.id, 'part-of', {})
      linkedTo = parent.id
    }
  }

  return Response.json({ ok: true, node, linkedTo })
}
