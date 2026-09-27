import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, getNodeById, createNode, createEdge, updateNode, getEdges, deleteEdge } from '@/lib/graph/queries'
import { addDays, isDueOn, todayStr } from '@/lib/date'
import { isStage } from '@/lib/content'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** First day after `from` the cadence lands on — at most two weeks out. */
function nextOnCadence(from: string, frequency: string, daysOfWeek: number[] | null): string | null {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(from, i)
    if (isDueOn(frequency, daysOfWeek, new Date(d + 'T00:00:00').getDay())) return d
  }
  return null
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const [seriesNodes, pieceNodes] = await Promise.all([
    getNodes(user.id, { type: 'ContentSeries' }),
    getNodes(user.id, { type: 'ContentPiece' }),
  ])

  const pieces = pieceNodes
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        title: str(p.title) ?? str(p.name) ?? `Piece #${n.id}`,
        stage: isStage(p.stage) ? p.stage : 'idea',
        platform: str(p.platform),
        format: str(p.format),
        seriesId: num(p.seriesNodeId),
        episode: num(p.episode),
        publishDate: str(p.publishDate),
        publishTime: str(p.publishTime),
        url: str(p.url),
      }
    })
    .sort((a, b) => (a.publishDate ?? '9999').localeCompare(b.publishDate ?? '9999') || b.id - a.id)

  const today = todayStr()
  const series = seriesNodes.map((n) => {
    const p = n.properties as Record<string, unknown>
    const mine = pieces.filter((x) => x.seriesId === n.id)
    const published = mine.filter((x) => x.stage === 'published')
    const lastPublished = published.map((x) => x.publishDate).filter((d): d is string => !!d).sort().pop() ?? null
    const frequency = str(p.frequency)
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    // The next slot after whichever is later: the last release or yesterday,
    // so a lapsed series points at an upcoming day rather than one long gone.
    const base = lastPublished && lastPublished >= today ? lastPublished : addDays(today, -1)
    return {
      id: n.id,
      name: str(p.name) ?? `Series #${n.id}`,
      description: str(p.description),
      platform: str(p.platform),
      status: str(p.status) ?? 'active',
      frequency,
      daysOfWeek,
      pieceCount: mine.length,
      publishedCount: published.length,
      nextEpisode: Math.max(0, ...mine.map((x) => x.episode ?? 0)) + 1,
      nextDue: frequency ? nextOnCadence(base, frequency, daysOfWeek) : null,
    }
  })

  return Response.json({ series, pieces })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const body = (await request.json()) as Record<string, unknown>

  if (body.kind === 'series') {
    const name = str(body.name)
    if (!name) return Response.json({ error: 'A series needs a name' }, { status: 400 })
    const node = await createNode(user.id, 'ContentSeries', {
      name,
      description: str(body.description) ?? undefined,
      platform: str(body.platform) ?? undefined,
      frequency: str(body.frequency) ?? undefined,
      daysOfWeek: Array.isArray(body.daysOfWeek) ? body.daysOfWeek : undefined,
      status: 'active',
    })
    return Response.json({ ok: true, id: node.id })
  }

  if (body.kind === 'piece') {
    const title = str(body.title)
    if (!title) return Response.json({ error: 'A piece needs a title' }, { status: 400 })
    const seriesId = num(body.seriesId)
    const series = seriesId ? await getNodeById(user.id, seriesId) : undefined
    if (seriesId && series?.type !== 'ContentSeries') {
      return Response.json({ error: 'Series not found' }, { status: 404 })
    }
    const node = await createNode(user.id, 'ContentPiece', {
      title,
      stage: isStage(body.stage) ? body.stage : 'idea',
      platform: str(body.platform) ?? undefined,
      format: str(body.format) ?? undefined,
      seriesNodeId: series ? series.id : undefined,
      episode: num(body.episode) ?? undefined,
      publishDate: str(body.publishDate) ?? undefined,
      publishTime: str(body.publishTime) ?? undefined,
    })
    // The property is what the hub reads; the edge is what the graph and the
    // assistant see. Both, like Assignments and their Course.
    if (series) await createEdge(user.id, node.id, series.id, 'part-of')
    return Response.json({ ok: true, id: node.id })
  }

  return Response.json({ error: 'kind must be "series" or "piece"' }, { status: 400 })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const { id, ...changes } = (await request.json()) as Record<string, unknown> & { id?: number }
  if (typeof id !== 'number') return Response.json({ error: 'id required' }, { status: 400 })

  const node = await getNodeById(user.id, id)
  if (!node || node.type !== 'ContentPiece') return Response.json({ error: 'Not found' }, { status: 404 })
  const props = { ...(node.properties as Record<string, unknown>) }

  if ('stage' in changes) {
    if (!isStage(changes.stage)) return Response.json({ error: 'Unknown stage' }, { status: 400 })
    props.stage = changes.stage
    if (changes.stage === 'published' && !props.publishDate) props.publishDate = todayStr()
  }
  for (const key of ['title', 'platform', 'format', 'publishDate', 'publishTime', 'url'] as const) {
    if (key in changes) props[key] = str(changes[key]) ?? undefined
  }
  if ('episode' in changes) props.episode = num(changes.episode) ?? undefined

  if ('seriesId' in changes) {
    const nextSeries = num(changes.seriesId)
    const oldSeries = num(props.seriesNodeId)
    if (nextSeries !== oldSeries) {
      for (const e of await getEdges(user.id, { sourceId: id, type: 'part-of' })) {
        if (e.targetId === oldSeries) await deleteEdge(user.id, e.id)
      }
      const series = nextSeries ? await getNodeById(user.id, nextSeries) : undefined
      props.seriesNodeId = series?.type === 'ContentSeries' ? series.id : undefined
      if (series?.type === 'ContentSeries') await createEdge(user.id, id, series.id, 'part-of')
    }
  }

  await updateNode(user.id, id, props)
  return Response.json({ ok: true })
}
