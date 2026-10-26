import { createNode, getNodes, updateNode } from '@/lib/graph/queries'
import { logger } from '@/lib/log'
import { audioCost, costOf, pricesFromEnv, type TokenUse } from '@/lib/ai/cost'
import { todayStr } from '@/lib/date'

/**
 * The running balance of what the AI has cost.
 *
 * One AiUsage node per user (hidden from the graph and from the model, like
 * Settings): a lifetime total, a bucket per month and a bucket per day for
 * the last 40 days. Every call adds its cost here as it finishes. Writing
 * must never break the call it is measuring, so it logs and moves on.
 */
export interface Bucket { usd: number; calls: number; inputTokens: number; cachedTokens: number; outputTokens: number }
export interface UsageSummary {
  total: Bucket
  month: Bucket
  today: Bucket
  /** What the cache saved this month, in dollars. */
  savedThisMonth: number
  /** Last 30 days, oldest first. */
  days: { date: string; usd: number }[]
}

const KEEP_DAYS = 40
const empty = (): Bucket => ({ usd: 0, calls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 })
const bucket = (v: unknown): Bucket => ({ ...empty(), ...((v && typeof v === 'object' ? v : {}) as Partial<Bucket>) })
const add = (b: Bucket, usd: number, use: TokenUse): Bucket => ({
  usd: b.usd + usd,
  calls: b.calls + 1,
  inputTokens: b.inputTokens + (use.inputTokens ?? 0),
  cachedTokens: b.cachedTokens + (use.cachedInputTokens ?? 0),
  outputTokens: b.outputTokens + (use.outputTokens ?? 0),
})

async function usageNode(userId: number) {
  return (await getNodes(userId, { type: 'AiUsage' }))[0]
}

/** Adds a finished call to the balance. `seconds` is for transcription, which is billed by the minute. */
export async function recordUsage(userId: number, use: TokenUse & { seconds?: number }, source: string, today: string = todayStr()): Promise<void> {
  try {
    const usd = costOf(use) + (use.seconds ? audioCost(use.seconds) : 0)
    const node = await usageNode(userId)
    const p = (node?.properties ?? {}) as Record<string, unknown>
    const months = { ...((p.months as Record<string, unknown>) ?? {}) }
    const days = { ...((p.days as Record<string, unknown>) ?? {}) }
    const sources = { ...((p.sources as Record<string, number>) ?? {}) }
    const month = today.slice(0, 7)
    months[month] = add(bucket(months[month]), usd, use)
    days[today] = add(bucket(days[today]), usd, use)
    for (const d of Object.keys(days).sort().slice(0, -KEEP_DAYS)) delete days[d]
    sources[source] = (sources[source] ?? 0) + usd
    const next = { total: add(bucket(p.total), usd, use), months, days, sources }
    if (node) await updateNode(userId, node.id, next)
    else await createNode(userId, 'AiUsage', next)
  } catch (error) {
    logger.warn('ai_usage_record_failed', { message: error instanceof Error ? error.message : String(error) })
  }
}

export async function readUsage(userId: number, today: string = todayStr()): Promise<UsageSummary> {
  const p = ((await usageNode(userId))?.properties ?? {}) as Record<string, unknown>
  const months = (p.months ?? {}) as Record<string, unknown>
  const days = (p.days ?? {}) as Record<string, unknown>
  const month = bucket(months[today.slice(0, 7)])
  const rates = pricesFromEnv()
  return {
    total: bucket(p.total),
    month,
    today: bucket(days[today]),
    savedThisMonth: (month.cachedTokens * (rates.input - rates.cached)) / 1_000_000,
    days: Object.keys(days).sort().slice(-30).map((date) => ({ date, usd: bucket(days[date]).usd })),
  }
}
