import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { deleteNode, getNodeById } from '@/lib/graph/queries'
import { listMemories, saveMemories, MEMORY_CATEGORIES, MEMORY_SOURCES, type MemoryCategory, type MemorySource } from '@/lib/memory'
import { loadAvailability } from '@/lib/availability'

/** Everything the app quietly remembers, so it can be seen and corrected in Settings. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const [memories, availability] = await Promise.all([listMemories(user.id), loadAvailability(user.id)])
  return Response.json({ memories, availability: availability.rules })
}

/** Saves memories the user approved after an import. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json()) as { items?: { text?: unknown; category?: unknown }[]; source?: unknown }

  const source: MemorySource = (MEMORY_SOURCES as readonly string[]).includes(body.source as string)
    ? (body.source as MemorySource)
    : 'paste'
  const items = (body.items ?? [])
    .filter((i) => typeof i.text === 'string' && i.text.trim())
    .map((i) => ({
      text: i.text as string,
      category: (MEMORY_CATEGORIES as readonly string[]).includes(i.category as string) ? (i.category as MemoryCategory) : 'fact',
    }))
    .slice(0, 300)

  return Response.json({ ok: true, ...(await saveMemories(user.id, items, source)) })
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = Number(new URL(request.url).searchParams.get('id'))
  const node = Number.isInteger(id) ? await getNodeById(user.id, id) : undefined
  // Only memory-shaped nodes: this endpoint must never become a general delete.
  if (!node || (node.type !== 'Memory' && node.type !== 'AvailabilityRule')) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  await deleteNode(user.id, id)
  return Response.json({ ok: true })
}
