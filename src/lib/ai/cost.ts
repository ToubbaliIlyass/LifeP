/**
 * What an AI call costs, from the tokens it used.
 *
 * Prices are US dollars per million tokens and live in one table so a change
 * of model or price is one line. They are an estimate — the provider's bill
 * is the truth — and each can be overridden from the environment
 * (AI_PRICE_INPUT, AI_PRICE_CACHED, AI_PRICE_OUTPUT, AI_PRICE_AUDIO_MINUTE)
 * without a deploy. Pure and table-tested (cost.test.ts).
 */
export interface Prices {
  /** Per million input tokens that were not cached. */
  input: number
  /** Per million input tokens served from the prompt cache. */
  cached: number
  /** Per million output tokens (reasoning included). */
  output: number
  /** Per minute of audio transcribed. */
  audioMinute: number
}

export const DEFAULT_PRICES: Prices = { input: 1.25, cached: 0.125, output: 10, audioMinute: 0.003 }

const num = (v: string | undefined, fallback: number) => {
  const n = v === undefined ? NaN : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function pricesFromEnv(env: Record<string, string | undefined> = process.env): Prices {
  return {
    input: num(env.AI_PRICE_INPUT, DEFAULT_PRICES.input),
    cached: num(env.AI_PRICE_CACHED, DEFAULT_PRICES.cached),
    output: num(env.AI_PRICE_OUTPUT, DEFAULT_PRICES.output),
    audioMinute: num(env.AI_PRICE_AUDIO_MINUTE, DEFAULT_PRICES.audioMinute),
  }
}

export interface TokenUse {
  inputTokens?: number | null
  /** The part of the input that came from the cache. */
  cachedInputTokens?: number | null
  outputTokens?: number | null
}

/** Dollars for one call. Cached input is billed at its own, lower rate, and is a part of the input count, not an addition to it. */
export function costOf(use: TokenUse, prices: Prices = pricesFromEnv()): number {
  const count = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)
  const input = count(use.inputTokens)
  const cached = Math.min(input, count(use.cachedInputTokens))
  const output = count(use.outputTokens)
  return ((input - cached) * prices.input + cached * prices.cached + output * prices.output) / 1_000_000
}

export const audioCost = (seconds: number, prices: Prices = pricesFromEnv()) => (Math.max(0, seconds) / 60) * prices.audioMinute

/** "$0.42", "$12.30", and "<$0.01" rather than a misleading "$0.00" for something that did cost. */
export function money(usd: number): string {
  if (usd <= 0) return '$0.00'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}
