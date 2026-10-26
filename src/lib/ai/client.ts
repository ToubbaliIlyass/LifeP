import { createOpenAI, openai } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { logger } from '@/lib/log'

/**
 * The model every call uses, with free ones standing behind it.
 *
 * When OpenAI refuses a call because the credits are gone (or it is rate
 * limiting), the same call is made again on OpenRouter — only ever on models
 * whose id ends in ":free", which OpenRouter never bills, tried best first
 * until one answers. The list is fixed here on purpose: nothing in the
 * environment can swap in a paid model. It exists only if OPENROUTER_API_KEY
 * is set; without it nothing changes.
 *
 * Picked from OpenRouter's catalogue (all free, all able to call tools):
 *   - for the assistant: Nemotron 3 Ultra (550B, 1M context) — tried live, it
 *     called tools and gave structured answers correctly — then Gemma 4 31B,
 *     Nemotron 3.5 Super, Inkling;
 *   - for quick capture, which needs a structured (JSON) answer: Ultra, then
 *     Nemotron 3.5 Super and Gemma 4 31B, the others that support it.
 * Nemotron 3 Super was left out: it answered 404 when tried.
 * Free models are limited to 50 requests a day (1,000 with $10 of credit on
 * the account), which is plenty for a safety net.
 *
 * Swap the model strings here to change providers without touching call sites.
 */
const primary = openai('gpt-5.6-luna')

const CHAT_FREE = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'thinkingmachines/inkling:free',
]
const STRUCTURED_FREE = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-31b-it:free',
]

const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY, name: 'openrouter' })
  : null
// A paid id can never get in: anything not ending ":free" is dropped.
const free = (ids: string[]) => (openrouter ? ids.filter((id) => id.endsWith(':free')).map((id) => openrouter.chat(id)) : [])

/** Whether a call is worth repeating elsewhere: out of credit, over a limit, or billing refused. */
export function isOutOfCredit(error: unknown): boolean {
  const e = error as { statusCode?: number; message?: string; responseBody?: string } | null
  if (!e) return false
  if (e.statusCode === 402 || e.statusCode === 429) return true
  return /insufficient_quota|billing_hard_limit|exceeded your current quota|credit balance/i.test(`${e.message ?? ''} ${e.responseBody ?? ''}`)
}

/** Whether a model id is one that costs nothing — its calls add nothing to the balance. */
export const isFreeModel = (id: string | undefined) => !!id && id.endsWith(':free')

/** After a refusal, the fallback is used straight away for a while rather than asking OpenAI again each time. */
const SKIP_MS = 5 * 60_000
let skipUntil = 0

function withFallback(main: LanguageModelV3, backups: LanguageModelV3[]): LanguageModelV3 {
  if (!backups.length) return main
  const attempt = (method: 'doGenerate' | 'doStream') =>
    async (options: never) => {
      const call = (m: LanguageModelV3) => (m[method] as (o: never) => Promise<never>).call(m, options)
      if (Date.now() >= skipUntil) {
        try {
          return await call(main)
        } catch (error) {
          if (!isOutOfCredit(error)) throw error
          skipUntil = Date.now() + SKIP_MS
          logger.warn('ai_fallback', { to: backups[0].modelId, reason: error instanceof Error ? error.message.slice(0, 200) : 'refused' })
        }
      }
      // Best free model first; a busy or failing one hands over to the next.
      let last: unknown
      for (const backup of backups) {
        try {
          return await call(backup)
        } catch (error) {
          last = error
          logger.warn('ai_fallback_model_failed', { model: backup.modelId, reason: error instanceof Error ? error.message.slice(0, 200) : 'failed' })
        }
      }
      throw last
    }
  return Object.assign(Object.create(main) as LanguageModelV3, { doGenerate: attempt('doGenerate'), doStream: attempt('doStream') })
}

export const defaultModel: LanguageModelV3 = withFallback(primary, free(CHAT_FREE))
/** For calls that need a structured (JSON) answer. */
export const structuredModel: LanguageModelV3 = withFallback(primary, free(STRUCTURED_FREE))

/** Whether any model is configured, so a route can say so before trying. */
export const aiConfigured = () => !!process.env.OPENAI_API_KEY || !!openrouter
