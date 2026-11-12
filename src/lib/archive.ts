import type { Edge, Node } from '@/lib/db/schema'
import { addDays } from '@/lib/date'
import { containerOf } from '@/lib/todos'
import { prayerKeyOf } from '@/lib/prayers'

/**
 * The Logbook's archive: what was finished more than a month ago stops being
 * loaded with the app and waits in the Archive, opened on demand.
 *
 * Archiving is a flag on the node (`archivedAt`), not a move or a delete, so
 * everything that reads history (what the planner learned from, what the
 * assistant can look up) still sees it. Only the app's own lists leave it
 * out (src/app/api/todos/route.ts). Putting an item back sets `archiveKeep`,
 * so the daily sweep does not take it away again.
 */

/** How long a finished thing stays in the Logbook proper. */
export const ARCHIVE_AFTER_DAYS = 30

export const archiveCutoff = (today: string) => addDays(today, -ARCHIVE_AFTER_DAYS)

const props = (n: Node) => n.properties as Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

export const isArchived = (n: Node) => str(props(n).archivedAt) !== null

const isDone = (n: Node) => {
  const s = props(n).status
  return n.type === 'Project' ? s === 'completed' || s === 'done' : n.type === 'Task' && s === 'done'
}

/** The day it was finished, as stored (UTC), falling back to when it was last touched. */
export function finishedDay(n: Node): string {
  return (str(props(n).completedAt) ?? n.updatedAt).slice(0, 10)
}

/**
 * What to archive today: finished to-dos and projects older than the cutoff.
 *
 * A finished to-do inside a project that is still going stays where it is, so
 * the project's progress is not thrown off; it goes with the project once
 * that is finished and old too. Prayers never are (they repeat for good), and
 * neither is anything already archived or put back by hand.
 */
export function planArchive({ nodes, edges, today }: { nodes: Node[]; edges: Edge[]; today: string }): number[] {
  const cutoff = archiveCutoff(today)
  const kindById = new Map<number, 'area' | 'project'>()
  for (const n of nodes) {
    if (n.type === 'Goal') kindById.set(n.id, 'area')
    else if (n.type === 'Project') kindById.set(n.id, 'project')
  }
  const eligible = (n: Node) => isDone(n) && !isArchived(n) && props(n).archiveKeep !== true && finishedDay(n) < cutoff

  const projects = new Set(nodes.filter((n) => n.type === 'Project' && eligible(n)).map((n) => n.id))
  const ids = [...projects]
  for (const n of nodes) {
    if (n.type !== 'Task' || prayerKeyOf(props(n)) || !eligible(n)) continue
    const home = containerOf(n.id, edges, kindById)
    // In a project: only if the project goes too. In an area, or nowhere: it can go on its own.
    if (home !== null && kindById.get(home) === 'project' && !projects.has(home)) continue
    ids.push(n.id)
  }
  return ids
}

/** Archived to-dos and projects, for the count beside the Archive. */
export const archivedOf = (nodes: Node[]) => nodes.filter((n) => (n.type === 'Task' || n.type === 'Project') && isArchived(n))

export const monthOf = (n: Node) => finishedDay(n).slice(0, 7)
