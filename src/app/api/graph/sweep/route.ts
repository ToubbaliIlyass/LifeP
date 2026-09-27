import { after } from 'next/server'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { readSettings, writeSettings } from '@/lib/settings'
import { sweepGraph } from '@/lib/ai/graph-sweep'

/**
 * The every-N-days graph tidy-up, as an endpoint.
 *
 * There is no scheduler here — this is a single-user Next app, not a queue —
 * so the app itself asks on load and the endpoint decides whether enough time
 * has passed. That makes "every 7 days" mean "the first time you open it
 * after 7 days", which for a planner someone opens most days is the same
 * thing, and it degrades gracefully: skip a fortnight and you get one sweep,
 * not fourteen. A real cron can POST here too; the due check is the same.
 */

/**
 * One sweep per user at a time. Two tabs opening together would otherwise
 * both find the sweep due, and both run it — each paying for the same model
 * calls and racing to write the same edges.
 */
const running = new Set<number>()

function isDue(lastRunAt: string | null, intervalDays: number): boolean {
  if (!lastRunAt) return true
  const elapsed = Date.now() - new Date(lastRunAt).getTime()
  return !Number.isFinite(elapsed) || elapsed >= intervalDays * 86_400_000
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { graphSweep } = await readSettings(user.id)
  return Response.json({
    enabled: graphSweep.enabled,
    intervalDays: graphSweep.intervalDays,
    lastRun: graphSweep.lastRun,
    due: graphSweep.enabled && isDue(graphSweep.lastRun?.ranAt ?? null, graphSweep.intervalDays),
    running: running.has(user.id),
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { force?: boolean }
  const settings = await readSettings(user.id)
  const { graphSweep, autoLink } = settings

  if (!body.force) {
    if (!graphSweep.enabled) return Response.json({ ran: false, reason: 'disabled' })
    if (!isDue(graphSweep.lastRun?.ranAt ?? null, graphSweep.intervalDays)) {
      return Response.json({ ran: false, reason: 'not-due', lastRun: graphSweep.lastRun })
    }
  }
  if (running.has(user.id)) return Response.json({ ran: false, reason: 'already-running' })

  /*
   * The timestamp is written BEFORE the work, not after. A sweep is twenty
   * model calls; if it fails halfway, or the process is killed, an unwritten
   * timestamp leaves it due again on the very next page load, and the user
   * gets a retry loop instead of a weekly tidy-up. Missing one sweep is the
   * cheaper failure.
   */
  const started = new Date().toISOString()
  await writeSettings(user.id, {
    graphSweep: {
      ...graphSweep,
      lastRun: { ranAt: started, scanned: 0, linked: 0, proposed: 0, tidied: 0, remaining: 0 },
    },
  })

  // The sweep outlives the response: nothing on screen is waiting for it, and
  // holding a request open for twenty model calls only invites a timeout.
  running.add(user.id)
  after(async () => {
    try {
      const result = await sweepGraph(user.id, autoLink === 'off' ? 'suggest' : autoLink)
      const latest = await readSettings(user.id)
      await writeSettings(user.id, { graphSweep: { ...latest.graphSweep, lastRun: result } })
    } catch {
      // The timestamp is already written, so a failed sweep waits its turn
      // rather than retrying on every load.
    } finally {
      running.delete(user.id)
    }
  })

  return Response.json({ ran: true, startedAt: started })
}
