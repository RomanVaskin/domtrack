import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { resolveTelegramOrderUrl, TELEGRAM_CONTACT_URL, TELEGRAM_PARTNER_START_URL } from '../lib/telegram-contact.ts'

// Known limitation of the existing infrastructure (same as tests/referral-route.test.ts):
// `node --test --experimental-strip-types` strips TypeScript types but has no JSX transform,
// so `app/page.tsx` and the components it renders (all `.tsx`) can't be `import()`-ed or
// rendered directly here — confirmed: `ERR_UNKNOWN_FILE_EXTENSION` for ".tsx". Building a
// JSX-capable loader just for this would mean standing up a real build toolchain, which the
// task explicitly asks not to do.
//
// The actual decision logic (`resolveTelegramOrderUrl`) is fully unit-tested in
// tests/telegram-contact.test.ts. What's missing coverage, and what these tests guard, is the
// *wiring*: that app/page.tsx computes the URL once and every CTA component receives and uses
// it, so a future edit can't silently reintroduce a hardcoded plain Telegram link on one CTA.
// This is a real regression check against the actual source files, not a reimplementation —
// it would fail if the wiring were removed or hardcoded, exactly the risk called out.

async function readSource(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('app/page.tsx computes telegramUrl once from the referral cookie and passes it to every CTA component', async () => {
  const source = await readSource('../app/page.tsx')
  assert.match(source, /getReferralCodeFromCookies/)
  assert.match(source, /const telegramUrl = resolveTelegramOrderUrl\(referralCode\)/)
  assert.match(source, /<SiteHeader telegramUrl=\{telegramUrl\}\s*\/>/)
  assert.match(source, /<Hero telegramUrl=\{telegramUrl\}\s*\/>/)
  assert.match(source, /<FinalCta telegramUrl=\{telegramUrl\}\s*\/>/)
})

test('SiteHeader, Hero and FinalCta each use the telegramUrl prop for their order CTA, never a hardcoded link', async () => {
  for (const path of ['../components/site-header.tsx', '../components/hero.tsx', '../components/final-cta.tsx']) {
    const source = await readSource(path)
    assert.match(source, /telegramUrl:\s*string/, `${path} must declare a required telegramUrl prop`)
    assert.match(source, /href=\{telegramUrl\}/, `${path} must use the telegramUrl prop as its CTA href`)
    assert.ok(!source.includes('t.me/DomTrackBot'), `${path} must not hardcode the plain Telegram URL`)
  }
})

test('resolveTelegramOrderUrl (the function app/page.tsx wires in) behaves correctly for both cases', () => {
  // Re-stating the two end-to-end scenarios the task asks for, anchored to the actual constants
  // the homepage imports (not a reimplementation — tests/telegram-contact.test.ts covers the
  // function itself in more depth).
  assert.equal(resolveTelegramOrderUrl('SOMECODE'), `${TELEGRAM_CONTACT_URL}?start=ref_SOMECODE`)
  assert.equal(resolveTelegramOrderUrl(null), TELEGRAM_CONTACT_URL)
  assert.notEqual(resolveTelegramOrderUrl(null), resolveTelegramOrderUrl('SOMECODE'))
})

test('/partners contains the required content (static regression guard, same .tsx limitation as above)', async () => {
  const source = await readSource('../app/partners/page.tsx')
  assert.match(source, /Партнёрская программа DomTrack/)
  assert.match(source, /10%/)
  assert.match(source, /Персональные данные клиента партнёру не показываются\./)
  assert.match(source, /Стать партнёром/)
  assert.match(source, /не гарантия дохода/)
  // The CTA must go through the shared constant (whose value is asserted below), not a
  // hardcoded `?start=partner` string duplicated in the page.
  assert.match(source, /TELEGRAM_PARTNER_START_URL/)
  assert.equal(TELEGRAM_PARTNER_START_URL, `${TELEGRAM_CONTACT_URL}?start=partner`)
})
