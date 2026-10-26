import { createOpenAI, openai } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { logger } from '@/lib/log'

/**
 * The model every call uses, with a free one standing behind it.
 *
 * When OpenAI refuses a call because the credits are gone (or it is rate
 * limiting), the same call is made again on OpenRouter's free router, so the
 * assistant keeps answering — more slowly and less well — instead of failing.
 * The fallback exists only if OPENROUTER_API_KEY is set; without it nothing
 * changes. OPENROUTER_MODEL picks another model (default: openrouter/free,
 * which chooses a free model that can use tools).
 *
 * Swap the model strings here to change providers without touching call sites.
 */
const primary = openai('gpt-5.6-luna')

const FALLBACK_ID = process.env.OPENROUTER_MODEL || 'openrouter/free'
const fallback: LanguageModelV3 | null = process.env.OPENROUTER_API_KEY
  ? createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY, name: 'openrouter' }).chat(FALLBACK_ID)
  : null

/** Whether a call is worth repeating elsewhere: out of credit, over a limit, or billing refused. */
export function isOutOfCredit(error: unknown): boolean {
  const e = error as { statusCode?: number; message?: string; responseBody?: string } | null
  if (!e) return false
  if (e.statusCode === 402 || e.statusCode === 429) return true
  return /insufficient_quota|billing_hard_limit|exceeded your current quota|credit balance/i.test(`${e.message ?? ''} ${e.responseBody ?? ''}`)
}

/** Whether a model id is one that costs nothing — its calls add nothing to the balance. */
export const isFreeModel = (id: string | undefined) => !!id && (id === 'openrouter/free' || id.endsWith(':free'))

/** After a refusal, the fallback is used straight away for a while rather than asking OpenAI again each time. */
const SKIP_MS = 5 * 60_000
let skipUntil = 0

function withFallback(main: LanguageModelV3, backup: LanguageModelV3): LanguageModelV3 {
  const attempt = (method: 'doGenerate' | 'doStream') =>
    async (options: never) => {
      if (Date.now() >= skipUntil) {
        try {
          return await (main[method] as (o: never) => Promise<never>)(options)
        } catch (error) {
          if (!isOutOfCredit(error)) throw error
          skipUntil = Date.now() + SKIP_MS
          logger.warn('ai_fallback', { to: FALLBACK_ID, reason: error instanceof Error ? error.message.slice(0, 200) : 'refused' })
        }
      }
      return (backup[method] as (o: never) => Promise<never>)(options)
    }
  return Object.assign(Object.create(main) as LanguageModelV3, { doGenerate: attempt('doGenerate'), doStream: attempt('doStream') })
}

export const defaultModel: LanguageModelV3 = fallback ? withFallback(primary, fallback) : primary

/** Whether any model is configured, so a route can say so before trying. */
export const aiConfigured = () => !!process.env.OPENAI_API_KEY || !!fallback
