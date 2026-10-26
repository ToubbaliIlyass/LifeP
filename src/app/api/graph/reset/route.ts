import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { db } from '@/lib/db'
import { edges, nodes, proposals } from '@/lib/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'

/**
 * Empties the graph and starts again.
 *
 * Kept back by default, because "reset my graph" is not a request to be
 * reconfigured from scratch: these are app settings that happen to live in a
 * node, not things the user thinks of as being *in* their graph. Losing your
 * palette, your location, your working hours and the access token you pasted
 * into another chatbot is a surprise, not a fresh start.
 *
 * Everything else goes — tasks, habits, their logs, notes, time blocks,
 * whatever the assistant had remembered. Pass `{ everything: true }` to take
 * the settings too.
 *
 * The Canvas credential is kept back for exactly the reason the token above
 * it is: it is an address and an access token the user pasted in, not
 * something they think of as being in their graph. Deleting it disconnected
 * Canvas silently — `settings.canvas.enabled` stayed true, so the app went
 * on saying it was connected while every sync answered "Canvas is not
 * connected", and the only way back was to find the token page again.
 */
const CONFIGURATION = ['Settings', 'ApiToken', 'CanvasCredential', 'AiUsage']

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { everything?: boolean }
  const keep = body.everything ? [] : CONFIGURATION

  const doomed = keep.length
    ? and(eq(nodes.userId, user.id), notInArray(nodes.type, keep))
    : eq(nodes.userId, user.id)

  /*
   * Awaited — every one of them.
   *
   * These used to be fire-and-forget `.run()` calls with the response sent
   * straight after. libSQL is a network client, so `.run()` hands back a
   * promise (see the note at the top of src/lib/graph/queries.ts); not
   * awaiting it meant the route could answer "ok" before a single row was
   * gone, any failure surfaced as an unhandled rejection rather than an
   * error the user could see, and on a host that freezes the function once
   * the response is sent, a reset could simply be left half-done.
   */
  const removed = await db.delete(nodes).where(doomed).returning({ id: nodes.id })

  // Edges cascade with their nodes (foreign keys are on), but an edge is only
  // reachable from a node — so a reset that kept some nodes back could still
  // leave edges pointing between them. Nothing here does, today; this is so
  // that stays true if CONFIGURATION ever grows something with edges.
  if (keep.length) await db.delete(edges).where(eq(edges.userId, user.id))

  // Proposals reference node ids that no longer exist.
  await db.delete(proposals).where(eq(proposals.userId, user.id))

  return Response.json({ ok: true, deleted: removed.length, keptSettings: keep.length > 0 })
}
