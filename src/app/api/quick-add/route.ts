import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { createNode } from '@/lib/graph/queries'

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
  const user = getCurrentUser()
  const body = await request.json() as { type?: string; properties?: Record<string, unknown> }

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

  const node = createNode(user.id, type, properties)
  return Response.json({ ok: true, node })
}
