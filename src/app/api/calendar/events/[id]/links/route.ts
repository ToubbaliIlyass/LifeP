import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { linkNode } from '@/lib/ai/suggest-links'
import { readSettings } from '@/lib/settings'

/**
 * Places a just-created event in the graph — "CS101 study group" under the
 * CS101 course, "Half marathon" against the running goal.
 *
 * Whether the edges are written or only proposed is the `autoLink` setting;
 * the caller gets back which happened so it can say so.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const { autoLink } = await readSettings(user.id)
    return Response.json(await linkNode(user.id, id, autoLink))
  } catch {
    // Linking is a nicety on top of an event that already exists.
    return Response.json({ linked: 0, proposed: false, names: [] })
  }
}
