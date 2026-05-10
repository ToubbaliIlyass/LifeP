import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'

export async function GET() {
  const user = getCurrentUser()

  const notes = getNodes(user.id, { type: 'Note' }).map((n) => {
    const p = n.properties as Record<string, unknown>
    return {
      id: n.id,
      type: 'note' as const,
      title: typeof p.title === 'string' ? p.title : `Note #${n.id}`,
      content: typeof p.content === 'string' ? p.content : '',
      createdAt: n.createdAt,
    }
  })

  const journal = getNodes(user.id, { type: 'JournalEntry' }).map((n) => {
    const p = n.properties as Record<string, unknown>
    return {
      id: n.id,
      type: 'journal' as const,
      title: typeof p.date === 'string' ? `Journal · ${p.date}` : `Entry #${n.id}`,
      content: typeof p.content === 'string' ? p.content : '',
      mood: typeof p.mood === 'string' ? p.mood : null,
      createdAt: n.createdAt,
    }
  })

  const all = [...notes, ...journal].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  )

  return Response.json({ notes: all })
}
