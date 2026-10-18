import { dispatchAll } from '@/lib/push-server'

/**
 * Sends every reminder that is due, to every device that asked for them.
 * Called once a minute by a scheduled job — a Supabase cron (see
 * docs/reminders.md) or Vercel Cron, both of which send
 * `Authorization: Bearer <CRON_SECRET>`. Anyone without it gets nothing.
 *
 * Under /api but not behind sign-in: listed as open in src/proxy.ts, and
 * guarded here instead.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Not authorised' }, { status: 401 })
  }
  return Response.json(await dispatchAll())
}

export const GET = run
export const POST = run
