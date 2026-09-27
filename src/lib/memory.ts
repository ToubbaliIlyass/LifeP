import { getNodes, createNode } from '@/lib/graph/queries'

/**
 * Long-term facts about the user, as Memory nodes.
 *
 * Written three ways — quietly by the assistant mid-conversation, from an
 * imported ChatGPT/Claude export the user reviewed, and by an outside chatbot
 * over MCP — and read back into every chat so the assistant does not have to
 * be told the same thing twice. Hidden from the graph; listed in Settings.
 */

export const MEMORY_CATEGORIES = ['goal', 'project', 'routine', 'preference', 'constraint', 'fact'] as const
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]

export const MEMORY_SOURCES = ['chat', 'chatgpt', 'claude', 'paste', 'mcp'] as const
export type MemorySource = (typeof MEMORY_SOURCES)[number]

export interface MemoryItem {
  id: number
  text: string
  category: MemoryCategory
  source: MemorySource
  createdAt: string
}

/** How many memories ride along in each chat request. The rest are still searchable. */
const CONTEXT_LIMIT = 60

/** Loose enough that "Goes to the gym." and "goes to the gym" are one memory. */
export function normaliseMemory(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
}

export async function listMemories(userId: number): Promise<MemoryItem[]> {
  return (await getNodes(userId, { type: 'Memory' }))
    .map((n) => {
      const p = n.properties as Record<string, unknown>
      return {
        id: n.id,
        text: typeof p.text === 'string' ? p.text : '',
        category: (MEMORY_CATEGORIES as readonly string[]).includes(p.category as string) ? (p.category as MemoryCategory) : 'fact',
        source: (MEMORY_SOURCES as readonly string[]).includes(p.source as string) ? (p.source as MemorySource) : 'chat',
        createdAt: n.createdAt,
      }
    })
    .filter((m) => m.text)
    .sort((a, b) => b.id - a.id)
}

export async function saveMemories(
  userId: number,
  items: { text: string; category: MemoryCategory }[],
  source: MemorySource,
): Promise<{ saved: number; skipped: number }> {
  const seen = new Set((await listMemories(userId)).map((m) => normaliseMemory(m.text)))
  let saved = 0
  let skipped = 0
  for (const item of items) {
    const text = item.text.trim().slice(0, 500)
    const key = normaliseMemory(text)
    if (!key || seen.has(key)) { skipped++; continue }
    seen.add(key)
    await createNode(userId, 'Memory', { text, category: item.category, source })
    saved++
  }
  return { saved, skipped }
}

export async function memoryContext(userId: number): Promise<string> {
  const memories = (await listMemories(userId)).slice(0, CONTEXT_LIMIT)
  if (memories.length === 0) return ''
  return [
    '## What you know about the user',
    'Your quiet long-term memory (id · category · fact). Use it; do not recite it or mention that you remember unless asked. Use forget with the id if something turns out wrong.',
    ...memories.map((m) => `- [${m.id}] ${m.category}: ${m.text}`),
  ].join('\n')
}
