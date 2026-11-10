import { generateText, Output } from 'ai'
import { z } from 'zod'
import { aiConfigured, structuredModel, isFreeModel } from '@/lib/ai/client'
import { recordUsage } from '@/lib/ai/usage'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { suggestSources } from '@/lib/identity'
import { buildTodos } from '@/lib/todos'
import { todayStr } from '@/lib/date'
import { logger } from '@/lib/log'

/** One thing that can count toward an identity, with the words to show for it. */
export interface MatchSource { kind: 'list' | 'item' | 'tag'; id: number | string; label: string }
export interface Match { name: string; listIds: number[]; itemIds: number[]; tags: string[]; sources: MatchSource[] }

interface Material {
  lists: { id: number; title: string; kind: string }[]
  items: { id: number; title: string }[]
  tags: string[]
}

/** What this person has to match against: their areas, projects, to-dos and tags, as the app lists them. */
export async function identityMaterial(userId: number): Promise<Material> {
  const [nodes, edges] = await Promise.all([getNodes(userId), getEdges(userId)])
  const { todos, lists } = buildTodos({ date: todayStr(), nodes, edges })
  return {
    lists: lists.filter((l) => !l.done && l.title.trim()).map((l) => ({ id: l.id, title: l.title, kind: l.kind })).slice(0, 80),
    // Repeating and standalone open to-dos: "run a marathon" is itself the work of a runner.
    items: todos.filter((t) => !t.done && t.title.trim()).map((t) => ({ id: t.id, title: t.title })).slice(0, 100),
    tags: [...new Set(todos.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b)).slice(0, 80),
  }
}

const MatchSchema = z.object({
  matches: z.array(z.object({
    name: z.string().describe('The identity, exactly as given'),
    listIds: z.array(z.number()).describe('ids of the areas or projects that are this person’s work'),
    itemIds: z.array(z.number()).describe('ids of the to-dos that belong to them'),
    tags: z.array(z.string()).describe('tags that belong to them, exactly as given'),
  })),
})

const describe = (m: Omit<Match, 'sources'>, material: Material): Match => ({
  ...m,
  sources: [
    ...m.listIds.map((id) => ({ kind: 'list' as const, id, label: material.lists.find((l) => l.id === id)?.title ?? '' })),
    ...m.itemIds.map((id) => ({ kind: 'item' as const, id, label: material.items.find((h) => h.id === id)?.title ?? '' })),
    ...m.tags.map((t) => ({ kind: 'tag' as const, id: t, label: `#${t}` })),
  ].filter((s) => s.label),
})

/**
 * What already counts toward each of these identities, so nobody has to tick
 * boxes from scratch: the model reads the names against the user's own areas,
 * projects, to-dos and tags, and what it picks is checked against what really
 * exists. The user then removes anything that is not right. When the model is
 * off or fails, the name-matching in src/lib/identity.ts fills in instead.
 */
export async function matchIdentities(userId: number, names: string[], date: string): Promise<Match[]> {
  const material = await identityMaterial(userId)
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 8)
  const heuristic = (name: string) => {
    const s = suggestSources(name, { lists: material.lists, items: material.items, tags: material.tags })
    return describe({ name, ...s }, material)
  }
  if (!clean.length) return []
  if (!aiConfigured() || !(material.lists.length + material.items.length + material.tags.length)) return clean.map(heuristic)

  try {
    const { output, usage, response } = await generateText({
      model: structuredModel,
      system: [
        'You match who someone is becoming to the things in their to-do system that are that person’s work.',
        'For each identity, list the area/project ids, to-do ids and tags that clearly belong to it, using only the ids and tags given. A runner’s: a "Marathon training" project, a "Run 5k" to-do, a #run tag.',
        'Include only what really fits; an empty list is fine. Never invent an id or a tag. Return every identity, with its name exactly as given.',
      ].join('\n'),
      prompt: JSON.stringify({ identities: clean, areasAndProjects: material.lists, items: material.items, tags: material.tags }),
      output: Output.object({ schema: MatchSchema }),
      providerOptions: { openai: { promptCacheKey: `acture-identity-match-${userId}` } },
      maxOutputTokens: 700,
    })
    void recordUsage(userId, isFreeModel(response.modelId) ? { ...usage, free: true } : usage, 'identity-match', date)

    const listOk = new Set(material.lists.map((l) => l.id))
    const itemOk = new Set(material.items.map((h) => h.id))
    const tagByLower = new Map(material.tags.map((t) => [t.toLowerCase(), t]))
    return clean.map((name) => {
      const hit = output.matches.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())
      if (!hit) return heuristic(name)
      const picked = {
        name,
        listIds: [...new Set(hit.listIds.filter((id) => listOk.has(id)))],
        itemIds: [...new Set(hit.itemIds.filter((id) => itemOk.has(id)))],
        tags: [...new Set(hit.tags.map((t) => tagByLower.get(t.toLowerCase())).filter((t): t is string => !!t))],
      }
      // Nothing from the model: the name itself may still point at something ("a runner" and a "Running" list).
      return picked.listIds.length + picked.itemIds.length + picked.tags.length ? describe(picked, material) : heuristic(name)
    })
  } catch (error) {
    logger.warn('identity_match_failed', { message: error instanceof Error ? error.message : String(error) })
    return clean.map(heuristic)
  }
}
