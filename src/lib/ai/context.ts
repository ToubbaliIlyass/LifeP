import { getNodes, getEdges } from '@/lib/graph/queries'

const ANCHOR_TYPES = new Set(['Goal', 'Project', 'Course'])
const EXCLUDE_TYPES = new Set(['HabitLog', 'JournalEntry'])
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'have', 'from', 'what',
  'want', 'need', 'add', 'create', 'make', 'new', 'can', 'you', 'help',
  'just', 'also', 'then', 'its', 'was', 'are', 'has', 'had',
])

// The snapshot is prepended to every request, so it is capped. Anchors stay
// generous; everything else is trimmed to the most recent entries. Anything the
// model needs beyond these caps it can pull with searchNodes / readGraph.
const MAX_PER_TYPE = 20
const MAX_TOTAL_NODES = 80
const MAX_EDGES = 30

export async function buildContextSnapshot(userId: number, userMessage: string): Promise<string> {
  const allNodes = await getNodes(userId)
  if (allNodes.length === 0) return ''

  const keywords = userMessage
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))

  const matched = allNodes.filter((node) => {
    if (EXCLUDE_TYPES.has(node.type)) return false
    if (ANCHOR_TYPES.has(node.type)) return true
    if (node.type === 'Habit') return true
    if (node.type === 'Task') {
      const props = node.properties as Record<string, unknown>
      return props.status !== 'done'
    }
    const name = String((node.properties as Record<string, unknown>).name ?? '').toLowerCase()
    return keywords.some((kw) => name.includes(kw))
  })

  if (matched.length === 0) return ''

  // Cap per type (keeping the highest ids — most recently created), then overall,
  // so a large graph cannot silently inflate every request.
  const perType = new Map<string, typeof matched>()
  for (const node of matched) {
    const bucket = perType.get(node.type) ?? []
    bucket.push(node)
    perType.set(node.type, bucket)
  }
  const capped: typeof matched = []
  const omittedByType: string[] = []
  for (const [type, nodes] of perType) {
    const sorted = [...nodes].sort((a, b) => b.id - a.id)
    capped.push(...sorted.slice(0, MAX_PER_TYPE))
    if (sorted.length > MAX_PER_TYPE) {
      omittedByType.push(`${sorted.length - MAX_PER_TYPE} more ${type}`)
    }
  }
  // Anchors survive the global cap first, then everything else by recency.
  const relevant = capped
    .sort((a, b) => {
      const rank = (n: typeof capped[number]) => (ANCHOR_TYPES.has(n.type) ? 0 : 1)
      return rank(a) - rank(b) || b.id - a.id
    })
    .slice(0, MAX_TOTAL_NODES)
  if (capped.length > relevant.length) {
    omittedByType.push(`${capped.length - relevant.length} others`)
  }

  // Build lookups for edge rendering
  const relevantIds = new Set(relevant.map((n) => n.id))
  const typeById = new Map(relevant.map((n) => [n.id, n.type]))
  const labelById = new Map(relevant.map((n) => {
    const p = n.properties as Record<string, unknown>
    const name = p.name ?? p.title ?? `#${n.id}`
    return [n.id, `${n.id}·${name}`]
  }))

  const byType: Record<string, typeof relevant> = {}
  for (const node of relevant) {
    if (!byType[node.type]) byType[node.type] = []
    byType[node.type].push(node)
  }

  const lines = ['## Graph snapshot']
  for (const [type, nodes] of Object.entries(byType)) {
    lines.push(`**${type}**`)
    for (const node of nodes) {
      const props = node.properties as Record<string, unknown>
      const name = props.name ?? props.title ?? `node #${node.id}`
      const status = props.status ? ` [${props.status}]` : ''
      lines.push(`  ${node.id} · ${name}${status}`)
    }
  }

  // Add existing relationships so the AI knows what's already connected
  const allEdges = await getEdges(userId)
  const relevantEdges = allEdges
    .filter((e) => relevantIds.has(e.sourceId) && relevantIds.has(e.targetId))
    .sort((a, b) => {
      // Edges touching Goals/Projects/Courses first
      const aHigh = ANCHOR_TYPES.has(typeById.get(a.sourceId) ?? '') || ANCHOR_TYPES.has(typeById.get(a.targetId) ?? '')
      const bHigh = ANCHOR_TYPES.has(typeById.get(b.sourceId) ?? '') || ANCHOR_TYPES.has(typeById.get(b.targetId) ?? '')
      return Number(bHigh) - Number(aHigh)
    })
    .slice(0, MAX_EDGES)

  if (relevantEdges.length > 0) {
    lines.push('', '**Existing relationships**')
    for (const edge of relevantEdges) {
      const src = labelById.get(edge.sourceId) ?? edge.sourceId
      const tgt = labelById.get(edge.targetId) ?? edge.targetId
      lines.push(`  ${src} --${edge.type}--> ${tgt}`)
    }
  }

  if (omittedByType.length > 0) {
    lines.push(
      '',
      `_Not shown: ${omittedByType.join(', ')}. Use searchNodes to find anything missing here._`,
    )
  }

  return '\n\n' + lines.join('\n')
}
