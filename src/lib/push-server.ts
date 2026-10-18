import webpush, { type PushSubscription } from 'web-push'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodes, users } from '@/lib/db/schema'
import { createNode, deleteNode, getEdges, getNodes, updateNode } from '@/lib/graph/queries'
import { readSettings } from '@/lib/settings'
import { momentIn, zoneFor } from '@/lib/clock'
import { buildTodos } from '@/lib/todos'
import { dueReminders, markSent, remindersIn, sentOn, type Reminder } from '@/lib/reminders'

/**
 * Reminders that arrive with Acture closed.
 *
 * Each device that turned notifications on is a PushDevice node — its push
 * endpoint and keys — private to the user and never shown to the assistant.
 * Once a minute a scheduled job calls /api/reminders/dispatch, which runs
 * dispatchAll(): for everyone with a device, work out what src/lib/reminders.ts
 * says is due on their own wall clock, send it to each of their devices, and
 * write it down on the item so it is never sent twice.
 */

export const PUSH_TYPE = 'PushDevice'

/** What the service worker (public/sw.js) receives. */
export interface PushPayload {
  title: string
  body: string
  tag: string
  url: string
  /** Enough for the notification's Done and Snooze buttons to act on. */
  kind?: 'todo' | 'event'
  id?: number
  itemType?: string
}

let configured = false
function configure(): boolean {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://app.acture.co', pub, priv)
  configured = true
  return true
}

function asSubscription(p: Record<string, unknown>): PushSubscription | null {
  const keys = p.keys as { p256dh?: unknown; auth?: unknown } | undefined
  if (typeof p.endpoint !== 'string' || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') return null
  return { endpoint: p.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

/** Remembers a device; the same endpoint twice is one device. */
export async function saveDevice(userId: number, sub: PushSubscription, label: string) {
  const existing = (await getNodes(userId, { type: PUSH_TYPE })).find((n) => (n.properties as Record<string, unknown>).endpoint === sub.endpoint)
  const props = { endpoint: sub.endpoint, keys: sub.keys, label: label.slice(0, 120), savedAt: new Date().toISOString() }
  if (existing) await updateNode(userId, existing.id, props)
  else await createNode(userId, PUSH_TYPE, props)
}

/** Forgets a device — turned off, or gone. */
export async function removeDevice(userId: number, endpoint: string) {
  for (const n of await getNodes(userId, { type: PUSH_TYPE })) {
    if ((n.properties as Record<string, unknown>).endpoint === endpoint) await deleteNode(userId, n.id)
  }
}

/** Sends to every device the user has; drops the ones the push service says are gone. */
export async function sendToUser(userId: number, payload: PushPayload): Promise<{ sent: number; gone: number }> {
  if (!configure()) return { sent: 0, gone: 0 }
  let sent = 0, gone = 0
  for (const n of await getNodes(userId, { type: PUSH_TYPE })) {
    const sub = asSubscription(n.properties as Record<string, unknown>)
    if (!sub) continue
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 15 * 60, urgency: 'high' })
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) { await deleteNode(userId, n.id); gone++ }
    }
  }
  return { sent, gone }
}

function payloadFor(r: Reminder): PushPayload {
  return { title: r.title, body: r.body, tag: r.key, url: '/app', kind: r.kind, id: r.id, itemType: r.itemType }
}

/** Sends one user's due reminders; returns how many went out. */
export async function dispatchFor(userId: number): Promise<number> {
  const all = await getNodes(userId)
  if (!all.some((n) => n.type === PUSH_TYPE)) return 0
  const settings = await readSettings(userId)
  const zone = zoneFor(null, settings.timeZone, settings.timeZoneOverride)
  const now = momentIn(zone)
  const edges = await getEdges(userId)
  const payload = buildTodos({ date: now.slice(0, 10), nodes: all, edges })
  const byId = new Map(all.map((n) => [n.id, n]))
  const sent = new Set(all.flatMap((n) => sentOn(n.properties as Record<string, unknown>)))
  const due = dueReminders(remindersIn(payload), now, sent)
  if (due.length === 0) return 0

  // Written down first: two runs that overlap send it once, not twice.
  const keysByNode = new Map<number, string[]>()
  for (const r of due) keysByNode.set(r.id, [...(keysByNode.get(r.id) ?? []), r.key])
  for (const [id, keys] of keysByNode) {
    const node = byId.get(id)
    if (!node) continue
    const p = { ...(node.properties as Record<string, unknown>) }
    markSent(p, keys)
    await updateNode(userId, id, p)
  }
  for (const r of due) await sendToUser(userId, payloadFor(r))
  return due.length
}

/** Everyone with a device, once. Called every minute by the scheduled job. */
export async function dispatchAll(): Promise<{ users: number; reminders: number }> {
  const withDevices = await db.selectDistinct({ id: users.id }).from(users)
    .innerJoin(nodes, and(eq(nodes.userId, users.id), eq(nodes.type, PUSH_TYPE))).all()
  let reminders = 0
  for (const u of withDevices) reminders += await dispatchFor(u.id).catch(() => 0)
  return { users: withDevices.length, reminders }
}
