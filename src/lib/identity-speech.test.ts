import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallbackIdentities } from './identity-speech'

test('splits a spoken list after the lead-in', () => {
  assert.deepEqual(fallbackIdentities('I want to be a runner and someone who writes.'), ['a runner', 'someone who writes'])
})
test('takes a bare phrase as it is', () => {
  assert.deepEqual(fallbackIdentities('a good friend'), ['a good friend'])
})
test('empty stays empty', () => {
  assert.deepEqual(fallbackIdentities('   '), [])
})
