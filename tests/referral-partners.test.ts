import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ACCESS_TOKEN_PATTERN, computeCommission, REFERRAL_CODE_PATTERN, UUID_PATTERN } from '../lib/referral-partners.ts'

test('commission: 10% of a completed order total price', () => {
  assert.equal(computeCommission(10_000, 10), 1000)
})

test('commission: rounds to the nearest ruble', () => {
  assert.equal(computeCommission(9999, 10), 1000)
})

test('commission: a null total price always yields 0, never throws', () => {
  assert.equal(computeCommission(null, 10), 0)
})

test('commission: 0 total price yields 0', () => {
  assert.equal(computeCommission(0, 10), 0)
})

test('REFERRAL_CODE_PATTERN accepts plausible codes and rejects garbage', () => {
  assert.equal(REFERRAL_CODE_PATTERN.test('ABCD234'), true)
  assert.equal(REFERRAL_CODE_PATTERN.test('ab'), false)
  assert.equal(REFERRAL_CODE_PATTERN.test('has space'), false)
  assert.equal(REFERRAL_CODE_PATTERN.test('<script>'), false)
})

test('UUID_PATTERN / ACCESS_TOKEN_PATTERN reject obviously invalid input', () => {
  assert.equal(UUID_PATTERN.test('not-a-uuid'), false)
  assert.equal(UUID_PATTERN.test('11111111-1111-1111-1111-111111111111'), true)
  assert.equal(ACCESS_TOKEN_PATTERN.test('short'), false)
  assert.equal(ACCESS_TOKEN_PATTERN.test('a'.repeat(32)), true)
})
