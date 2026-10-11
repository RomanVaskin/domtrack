import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildReferralTelegramDeepLink, resolveTelegramOrderUrl, TELEGRAM_CONTACT_URL } from '../lib/telegram-contact.ts'

test('a referral cookie resolves to the Telegram start=ref_CODE deep link', () => {
  assert.equal(resolveTelegramOrderUrl('ABCD234'), `${TELEGRAM_CONTACT_URL}?start=ref_ABCD234`)
})

test('no referral cookie resolves to the plain Telegram contact URL', () => {
  assert.equal(resolveTelegramOrderUrl(null), TELEGRAM_CONTACT_URL)
})

test('buildReferralTelegramDeepLink encodes the code', () => {
  assert.equal(buildReferralTelegramDeepLink('AB CD'), `${TELEGRAM_CONTACT_URL}?start=ref_AB%20CD`)
})
