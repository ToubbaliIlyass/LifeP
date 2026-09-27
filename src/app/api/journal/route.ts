import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'
import { toRow, writeJournalEntry } from '@/lib/journal'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const entries = (await getNodes(user.id, { type: 'JournalEntry' }))
    .map(toRow)
    .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)))

  return Response.json({ entries })
}

/**
 * Write the entry for a day.
 *
 * One page per date, so this upserts rather than inserts — see
 * src/lib/journal.ts, which the assistant writes through as well. From the
 * panel the whole text is on screen being edited, so it replaces; the
 * assistant appends instead.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as { date?: unknown; content?: unknown; mood?: unknown }
  const result = await writeJournalEntry(user.id, {
    date: typeof body.date === 'string' ? body.date : undefined,
    content: typeof body.content === 'string' ? body.content : '',
    mood: typeof body.mood === 'string' ? body.mood : null,
  })
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 })
  return Response.json(result)
}
