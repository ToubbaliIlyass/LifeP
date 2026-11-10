import { createNode } from '@/lib/graph/queries'
import { PRAYERS, PRAYER_LABELS } from '@/lib/prayer-times'
import { prayerKeyOf } from '@/lib/prayers'
import type { Node } from '@/lib/db/schema'

/**
 * Makes sure each of the five has its to-do, when prayers are switched on.
 *
 * Idempotent and cheap (nodes are already read by the caller), so it runs on
 * every load of the list rather than being a step somebody has to remember:
 * turning prayers on in Settings needs no migration, and a missing one is
 * simply made. See src/lib/prayers.ts for the shape of the thing.
 */
export async function ensurePrayerTasks(userId: number, nodes: Node[]): Promise<Node[]> {
  const have = new Set(
    nodes.filter((n) => n.type === 'Task').map((n) => prayerKeyOf(n.properties as Record<string, unknown>)).filter(Boolean),
  )
  const made: Node[] = []
  for (const key of PRAYERS) {
    if (have.has(key)) continue
    made.push(await createNode(userId, 'Task', {
      name: PRAYER_LABELS[key],
      prayer: key,
      recurrence: { frequency: 'daily' },
      status: 'todo',
      doneDates: [],
      order: PRAYERS.indexOf(key) - 10,
    }))
  }
  return made.length ? [...nodes, ...made] : nodes
}
