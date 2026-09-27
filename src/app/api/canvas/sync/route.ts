import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { canvasErrorMessage, recordCanvasState, recordSyncSummary, syncCanvas } from '@/lib/canvas'
import { readSettings } from '@/lib/settings'

/**
 * Pull everything in from Canvas.
 *
 * Idempotent, so the button can be pressed as often as the user likes: each
 * course, assignment, quiz and announcement is matched on the Canvas id it
 * carries and updated in place.
 */
/** How stale a sync may get before an ordinary page load refreshes it. */
const AUTO_SYNC_HOURS = 6

/** Guards against a second sync starting while one is still walking Canvas. */
const running = new Set<number>()

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  /*
   * `{ auto: true }` is the app asking on a page load rather than the user
   * pressing Sync. There is no cron behind a single-user Next app, so the
   * client asks every load and this decides — the same arrangement the graph
   * sweep uses. Without it Canvas is only ever as fresh as the last time
   * somebody remembered to open Settings, which is not what "automatic" means
   * to anyone waiting on an assignment appearing.
   */
  const body = (await request.json().catch(() => ({}))) as { auto?: boolean }
  if (body.auto) {
    const { canvas } = await readSettings(user.id)
    if (!canvas.enabled) return Response.json({ ran: false, reason: 'not-connected' })
    const last = canvas.lastSync ? Date.parse(canvas.lastSync) : 0
    if (Number.isFinite(last) && Date.now() - last < AUTO_SYNC_HOURS * 3_600_000) {
      return Response.json({ ran: false, reason: 'recent' })
    }
    // A failing token would otherwise be retried on every single page load.
    if (canvas.lastError) return Response.json({ ran: false, reason: 'last-attempt-failed' })
  }

  if (running.has(user.id)) return Response.json({ ran: false, reason: 'already-running' })
  running.add(user.id)

  try {
    const summary = await syncCanvas(user.id)
    await recordSyncSummary(user.id, summary)
    await recordCanvasState(user.id, { lastSync: summary.ranAt, lastError: null })
    return Response.json({ ok: true, summary })
  } catch (e) {
    const error = canvasErrorMessage(e)
    await recordCanvasState(user.id, { lastError: error })
    return Response.json({ error }, { status: 400 })
  } finally {
    running.delete(user.id)
  }
}
