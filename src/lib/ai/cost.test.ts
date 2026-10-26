import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audioCost, costOf, money, pricesFromEnv, type Prices } from './cost'

const P: Prices = { input: 1, cached: 0.1, output: 10, audioMinute: 0.006 }

test('cached input is billed at its own rate and is part of the input', () => {
  assert.equal(costOf({ inputTokens: 1_000_000, outputTokens: 0 }, P), 1)
  assert.equal(costOf({ inputTokens: 1_000_000, cachedInputTokens: 1_000_000 }, P), 0.1)
  assert.ok(Math.abs(costOf({ inputTokens: 1000, cachedInputTokens: 800, outputTokens: 100 }, P) - (200 + 80 + 1000) / 1e6) < 1e-12)
})

test('missing or nonsense counts cost nothing rather than breaking', () => {
  assert.equal(costOf({}, P), 0)
  assert.equal(costOf({ inputTokens: 10, cachedInputTokens: 99 }, P), 10 * 0.1 / 1e6)
  assert.equal(costOf({ inputTokens: -5, outputTokens: NaN as unknown as number }, P) >= 0, true)
})

test('audio is by the minute, money is shown to the cent', () => {
  assert.equal(audioCost(30, P), 0.003)
  assert.equal(money(0), '$0.00')
  assert.equal(money(0.0004), '<$0.01')
  assert.equal(money(12.3456), '$12.35')
})

test('prices can be overridden, and bad overrides are ignored', () => {
  assert.equal(pricesFromEnv({ AI_PRICE_OUTPUT: '4' }).output, 4)
  assert.equal(pricesFromEnv({ AI_PRICE_OUTPUT: 'abc' }).output, pricesFromEnv({}).output)
})
