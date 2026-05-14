import { getNodes, getEdges } from '@/lib/graph/queries'

const ANCHOR_TYPES = new Set(['Goal', 'Project', 'Course'])
const EXCLUDE_TYPES = new Set(['HabitLog', 'JournalEntry'])
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'have', 'from', 'what',
  'want', 'need', 'add', 'create', 'make', 'new', 'can', 'you', 'help',
  'just', 'also', 'then', 'its', 'was', 'are', 'has', 'had',
])

export function buildContextSnapshot(userId: number, userMessage: string): string {
  const allNodes = getNodes(userId)
  if (allNodes.length === 0) return ''

  const keywords = userMessage
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))

  const relevant = allNodes.filter((node) => {
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

  if (relevant.length === 0) return ''

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
  const allEdges = getEdges(userId)
  const relevantEdges = allEdges
    .filter((e) => relevantIds.has(e.sourceId) && relevantIds.has(e.targetId))
    .sort((a, b) => {
      // Edges touching Goals/Projects/Courses first
      const aHigh = ANCHOR_TYPES.has(typeById.get(a.sourceId) ?? '') || ANCHOR_TYPES.has(typeById.get(a.targetId) ?? '')
      const bHigh = ANCHOR_TYPES.has(typeById.get(b.sourceId) ?? '') || ANCHOR_TYPES.has(typeById.get(b.targetId) ?? '')
      return Number(bHigh) - Number(aHigh)
    })
    .slice(0, 30)

  if (relevantEdges.length > 0) {
    lines.push('', '**Existing relationships**')
    for (const edge of relevantEdges) {
      const src = labelById.get(edge.sourceId) ?? edge.sourceId
      const tgt = labelById.get(edge.targetId) ?? edge.targetId
      lines.push(`  ${src} --${edge.type}--> ${tgt}`)
    }
  }

  return '\n\n' + lines.join('\n')
}
