import { createNode, getNodes, updateNode } from '@/lib/graph/queries'
import { identityOf, nextHue, type Identity } from '@/lib/identity'
import { readSettings, writeSettings } from '@/lib/settings'
import { clockIn, zoneFor } from '@/lib/clock'
import { matchIdentities, type MatchSource } from '@/lib/identity-match'

export interface Sources { listIds: number[]; itemIds: number[]; tags: string[] }

/**
 * Makes one identity, once.
 *
 * The one place an Identity is written (the identities route and the
 * assistant both come here): a name already taken (ignoring case) is not
 * made twice, a colour and an order are given, and Your World is switched on,
 * because naming who you are becoming is asking for it. With `auto` and
 * nothing chosen, what counts toward it is filled in from the user's own
 * lists; otherwise exactly what was chosen is kept, even when that is nothing.
 */
export async function createIdentity(
  userId: number,
  name: string,
  chosen: Sources,
  options: { auto?: boolean; tz?: string | null } = {},
): Promise<{ identity: Identity; created: boolean; sources: MatchSource[] }> {
  const clean = name.trim().replace(/^i['’]?m becoming\s+/i, '').slice(0, 80)
  const existing = (await getNodes(userId, { type: 'Identity' })).map(identityOf)
  const same = existing.find((i) => i.name.trim().toLowerCase() === clean.toLowerCase())
  if (same) {
    // Said again, when it was named before anything fit: look again now, and fill in only if it still counts nothing.
    if (options.auto && !same.listIds.length && !same.itemIds.length && !same.tags.length) {
      const settings = await readSettings(userId)
      const date = clockIn(zoneFor(options.tz ?? null, settings.timeZone, settings.timeZoneOverride)).date
      const [m] = await matchIdentities(userId, [same.name], date)
      if (m && (m.listIds.length || m.itemIds.length || m.tags.length)) {
        const node = (await getNodes(userId, { type: 'Identity' })).find((n) => n.id === same.id)
        if (node) {
          const updated = await updateNode(userId, same.id, { ...(node.properties as Record<string, unknown>), listIds: m.listIds, itemIds: m.itemIds, tags: m.tags })
          return { identity: updated ? identityOf(updated) : same, created: false, sources: m.sources }
        }
      }
    }
    return { identity: same, created: false, sources: [] }
  }

  let { listIds, itemIds, tags } = chosen
  let sources: MatchSource[] = []
  if (options.auto && !listIds.length && !itemIds.length && !tags.length) {
    const settings = await readSettings(userId)
    const date = clockIn(zoneFor(options.tz ?? null, settings.timeZone, settings.timeZoneOverride)).date
    const [m] = await matchIdentities(userId, [clean], date)
    if (m) { listIds = m.listIds; itemIds = m.itemIds; tags = m.tags; sources = m.sources }
  }

  const node = await createNode(userId, 'Identity', {
    name: clean,
    hue: nextHue(existing),
    listIds,
    itemIds,
    tags,
    order: existing.reduce((m, i) => Math.max(m, i.order), 0) + 1,
  })
  const settings = await readSettings(userId)
  if (!settings.world?.enabled) await writeSettings(userId, { world: { enabled: true } })
  return { identity: identityOf(node), created: true, sources }
}
