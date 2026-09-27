import { createNode, getNodes, updateNode } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'

/**
 * A journal is one page per date.
 *
 * Shared by the panel and the assistant so both write the same way. Without
 * that, telling the assistant about your day after writing in the panel left
 * two competing accounts of one day in the graph, and neither knew about the
 * other.
 */

export const MOODS = ['great', 'good', 'okay', 'bad', 'awful'] as const
export type Mood = (typeof MOODS)[number]

const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface EntryRow {
  id: number
  date: string
  content: string
  mood: string | null
  createdAt: string
  updatedAt: string
}

export function toRow(node: { id: number; properties: unknown; createdAt: string; updatedAt: string }): EntryRow {
  const p = node.properties as Record<string, unknown>
  return {
    id: node.id,
    // The AI has been writing JournalEntry nodes since before the panel
    // existed and did not always stamp a date; fall back to the day the node
    // was written so such an entry still sorts and groups with the rest.
    date: typeof p.date === 'string' && DATE.test(p.date) ? p.date : node.createdAt.slice(0, 10),
    content: typeof p.content === 'string' ? p.content : '',
    mood: typeof p.mood === 'string' && (MOODS as readonly string[]).includes(p.mood) ? p.mood : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

export interface JournalWrite {
  date?: string
  content: string
  mood?: string | null
  /**
   * Add to the day rather than replace it. The assistant's default: someone
   * saying a second thing about today at nine in the evening is continuing
   * the entry, not retracting the one from lunchtime. The panel replaces,
   * because there the whole text is in front of them being edited.
   */
  append?: boolean
}

export interface JournalResult {
  ok: boolean
  id?: number
  date?: string
  created?: boolean
  error?: string
}

export async function writeJournalEntry(userId: number, input: JournalWrite): Promise<JournalResult> {
  const date = typeof input.date === 'string' && DATE.test(input.date) ? input.date : todayStr()
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  if (!content) return { ok: false, error: 'Write something first' }
  const mood =
    typeof input.mood === 'string' && (MOODS as readonly string[]).includes(input.mood) ? input.mood : null

  const existing = (await getNodes(userId, { type: 'JournalEntry' }))
    .map((n) => ({ node: n, row: toRow(n) }))
    .filter((e) => e.row.date === date)
    // If duplicates for a date already exist, edit the oldest — the one any
    // link in the graph is most likely to point at.
    .sort((a, b) => a.node.id - b.node.id)[0]

  if (existing) {
    // Spread the existing properties so anything else on the node — a link the
    // assistant added, say — survives an edit.
    const props: Record<string, unknown> = { ...(existing.node.properties as Record<string, unknown>), date }
    props.content = input.append && existing.row.content
      ? `${existing.row.content}\n\n${content}`
      : content
    // Clearing the mood clears the stored one rather than silently leaving the
    // previous answer in place. An append with no mood keeps what is there:
    // adding a line to the evening should not erase how the morning felt.
    if (mood) props.mood = mood
    else if (!input.append) delete props.mood
    const updated = await updateNode(userId, existing.node.id, props)
    return { ok: true, id: updated?.id ?? existing.node.id, date, created: false }
  }

  const node = await createNode(userId, 'JournalEntry', { date, content, ...(mood ? { mood } : {}) })
  return { ok: true, id: node.id, date, created: true }
}
