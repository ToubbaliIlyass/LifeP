import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFreeModel, isOutOfCredit } from './client'

test('out of credit or over a limit is worth repeating elsewhere; other failures are not', () => {
  assert.equal(isOutOfCredit({ statusCode: 429, message: 'Rate limit' }), true)
  assert.equal(isOutOfCredit({ statusCode: 402 }), true)
  assert.equal(isOutOfCredit({ statusCode: 400, responseBody: '{"error":{"code":"insufficient_quota"}}' }), true)
  assert.equal(isOutOfCredit({ statusCode: 400, message: 'Invalid schema' }), false)
  assert.equal(isOutOfCredit(new Error('network down')), false)
  assert.equal(isOutOfCredit(null), false)
})

test('free models are told apart from paid ones', () => {
  assert.equal(isFreeModel('openrouter/free'), true)
  assert.equal(isFreeModel('google/gemma-4-31b-it:free'), true)
  assert.equal(isFreeModel('gpt-5.6-luna'), false)
  assert.equal(isFreeModel(undefined), false)
})
