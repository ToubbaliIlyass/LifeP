/**
 * What an AI call costs, from the tokens it used.
 *
 * Prices are US dollars per million tokens, from OpenAI's model page for
 * gpt-5.6-luna (developers.openai.com/api/docs/models/gpt-5.6-luna). They are
 * an estimate — the provider's bill is the truth. Pure and table-tested
 * (cost.test.ts).
 */
export interface Prices {
  /** Per million input tokens that were not cached. */
  input: number
  /** Per million input tokens served from the prompt cache. */
  cached: number
  /** Per million output tokens (reasoning included). */
  output: number
  /** Per minute of audio transcribed (gpt-4o-mini-transcribe; about $0.003, as the docs give it per token only). */
  audioMinute: number
}

export const PRICES: Prices = { input: 0.2, cached: 0.02, output: 1.2, audioMinute: 0.003 }
/** Prompts over this many tokens are billed at 2x input and 1.5x output, for the whole request. */
const LONG_PROMPT = 272_000

export interface TokenUse {
  inputTokens?: number | null
  /** The part of the input that came from the cache. */
  cachedInputTokens?: number | null
  outputTokens?: number | null
}

/** Dollars for one call. Cached input is billed at its own, lower rate, and is a part of the input count, not an addition to it. */
export function costOf(use: TokenUse, prices: Prices = PRICES): number {
  const count = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)
  const input = count(use.inputTokens)
  const cached = Math.min(input, count(use.cachedInputTokens))
  const output = count(use.outputTokens)
  const long = input > LONG_PROMPT
  return ((input - cached) * prices.input * (long ? 2 : 1) + cached * prices.cached * (long ? 2 : 1) + output * prices.output * (long ? 1.5 : 1)) / 1_000_000
}

export const audioCost = (seconds: number, prices: Prices = PRICES) => (Math.max(0, seconds) / 60) * prices.audioMinute

/** "$0.42", "$12.30", and "<$0.01" rather than a misleading "$0.00" for something that did cost. */
export function money(usd: number): string {
  if (usd <= 0) return '$0.00'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}
