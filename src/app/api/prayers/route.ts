import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, getNodes, updateNode } from '@/lib/graph/queries'
import { readSettings, writeSettings } from '@/lib/settings'
import { PRAYERS, type Prayer } from '@/lib/prayer-times'
import { todayStr } from '@/lib/date'
import { findPrayerHabit } from '@/lib/prayers'

/**
 * Ticking off one of the five.
 *
 * Nothing new is stored per prayer: a PrayerLog node each would be five a
 * day, eighteen hundred a year, and a graph full of bookkeeping nobody wants
 * to look at. Instead the day's existing HabitLog carries a `prayers` list,
 * and the habit counts as done once all five are in — so the streak, the
 * history and the link to "Get closer to God" all keep working, and the
 * timeline is not showing the same commitment twice.
 */

const isPrayer = (v: unknown): v is Prayer => typeof v === 'string' && (PRAYERS as readonly string[]).includes(v)

/**
 * The habit the five tick off. Found once by name and remembered, because
 * matching on a name every time would silently stop working the moment it
 * was renamed — and the id keeps working.
 */
async function resolveHabit(userId: number, stored: number | null): Promise<number | null> {
  return findPrayerHabit(await getNodes(userId, { type: 'Habit' }), stored)
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as { prayer?: unknown; done?: unknown; date?: unknown }
  if (!isPrayer(body.prayer)) {
    return Response.json({ error: `prayer must be one of ${PRAYERS.join(', ')}` }, { status: 400 })
  }
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayStr()
  const done = body.done !== false

  const settings = await readSettings(user.id)
  const habitNodeId = await resolveHabit(user.id, settings.prayer.habitNodeId)
  if (habitNodeId === null) {
    return Response.json({ error: 'No prayer habit to record against. Create one first.' }, { status: 409 })
  }
  if (habitNodeId !== settings.prayer.habitNodeId) {
    await writeSettings(user.id, { prayer: { ...settings.prayer, habitNodeId } })
  }

  const logs = await getNodes(user.id, { type: 'HabitLog' })
  const existing = logs.find((n) => {
    const p = n.properties as Record<string, unknown>
    return p.habitNodeId === habitNodeId && p.date === date
  })

  const current: Prayer[] = (() => {
    const raw = (existing?.properties as Record<string, unknown> | undefined)?.prayers
    return Array.isArray(raw) ? raw.filter(isPrayer) : []
  })()

  const next = done
    ? [...new Set([...current, body.prayer])]
    : current.filter((p) => p !== body.prayer)
  // Ordered as the day runs, so the stored list reads like the day did.
  next.sort((a, b) => PRAYERS.indexOf(a) - PRAYERS.indexOf(b))

  const completed = next.length === PRAYERS.length
  const properties = {
    ...((existing?.properties as Record<string, unknown>) ?? {}),
    habitNodeId,
    date,
    prayers: next,
    completed,
  }

  if (existing) await updateNode(user.id, existing.id, properties)
  else await createNode(user.id, 'HabitLog', properties)

  return Response.json({ ok: true, prayers: next, completed })
}
