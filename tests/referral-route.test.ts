import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// Node's plain ESM resolver can't follow `next/server`'s bare subpath (no "exports" map in the
// `next` package) or this project's `@/*` alias outside Next's own bundler. Registering a tiny
// resolver shim (test infra only — see tests/support/next-module-loader.mjs) lets this file
// import the REAL app/r/[code]/route.ts and call its real GET handler, instead of only testing
// the helper it calls.
register('./support/next-module-loader.mjs', import.meta.url)

// Computed relative to this file (not hardcoded), so it resolves correctly regardless of where
// the repository checkout lives (sandbox, CI, a contributor's machine, ...).
const REFERRAL_PARTNERS_MODULE = fileURLToPath(new URL('../lib/referral-partners.ts', import.meta.url))

test('GET /r/[code] — an active partner sets the referral cookie and redirects home', async (t) => {
  t.mock.module(REFERRAL_PARTNERS_MODULE, {
    namedExports: {
      getActiveReferralPartnerByCode: async (code: string) =>
        code === 'GOODCODE' ? { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', code: 'GOODCODE' } : null,
    },
  })
  const { GET } = await import('../app/r/[code]/route.ts')
  const req = new Request('https://domtrack.ru/r/GOODCODE')
  const res = await GET(req, { params: Promise.resolve({ code: 'GOODCODE' }) })

  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'https://domtrack.ru/')

  const setCookie = res.headers.get('set-cookie')
  assert.ok(setCookie, 'expected a Set-Cookie header')
  assert.match(setCookie, /^referral_code=GOODCODE;/)
  assert.match(setCookie, /Path=\//)
  assert.match(setCookie, /Max-Age=2592000/) // 30 days, in seconds
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=lax/i)
  // Not running with NODE_ENV=production in this test, so `secure` must be false (no "Secure" attribute).
  assert.ok(!/;\s*Secure/i.test(setCookie), 'cookie must not be marked Secure outside production')
})

test('GET /r/[code] — secure matches production behavior', async (t) => {
  t.mock.module(REFERRAL_PARTNERS_MODULE, {
    namedExports: {
      getActiveReferralPartnerByCode: async () => ({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', code: 'GOODCODE' }),
    },
  })
  const { GET } = await import('../app/r/[code]/route.ts')
  const env = process.env as Record<string, string | undefined>
  const previousEnv = env.NODE_ENV
  env.NODE_ENV = 'production'
  try {
    const req = new Request('https://domtrack.ru/r/GOODCODE')
    const res = await GET(req, { params: Promise.resolve({ code: 'GOODCODE' }) })
    const setCookie = res.headers.get('set-cookie')
    assert.match(setCookie ?? '', /;\s*Secure/i)
  } finally {
    env.NODE_ENV = previousEnv
  }
})

test('GET /r/[code] — an unknown code redirects home and sets no cookie', async (t) => {
  t.mock.module(REFERRAL_PARTNERS_MODULE, {
    namedExports: {
      getActiveReferralPartnerByCode: async () => null,
    },
  })
  const { GET } = await import('../app/r/[code]/route.ts')
  const req = new Request('https://domtrack.ru/r/DOESNOTEXIST')
  const res = await GET(req, { params: Promise.resolve({ code: 'DOESNOTEXIST' }) })

  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'https://domtrack.ru/')
  assert.equal(res.headers.get('set-cookie'), null)
})

test('GET /r/[code] — an inactive partner\'s code redirects home and sets no cookie', async (t) => {
  // getActiveReferralPartnerByCode itself only ever resolves active partners (asserted
  // separately in tests/referral-partners.test.ts); here we assert the route's own behavior
  // when the lookup correctly reports "not found" for a disabled partner.
  t.mock.module(REFERRAL_PARTNERS_MODULE, {
    namedExports: {
      getActiveReferralPartnerByCode: async (code: string) => {
        assert.equal(code, 'DISABLEDCODE')
        return null
      },
    },
  })
  const { GET } = await import('../app/r/[code]/route.ts')
  const req = new Request('https://domtrack.ru/r/DISABLEDCODE')
  const res = await GET(req, { params: Promise.resolve({ code: 'DISABLEDCODE' }) })

  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'https://domtrack.ru/')
  assert.equal(res.headers.get('set-cookie'), null)
})

// --- /partner/[token] -------------------------------------------------------------------
//
// Known limitation of the existing infrastructure: `node --test --experimental-strip-types`
// (this project's test runner) can load `.ts` files but cannot parse `.tsx` — it has no JSX
// transform, only TypeScript type-stripping. `app/partner/[token]/page.tsx` is JSX, so it
// cannot be `import()`-ed directly here, mocked or not (confirmed: `ERR_UNKNOWN_FILE_EXTENSION`
// for ".tsx"). Building a JSX-capable loader just for this one test would mean standing up a
// real build toolchain, which the task explicitly asks not to do ("не строй новый test
// framework только ради этого").
//
// The nearest real boundary we *can* exercise without one: the page's entire 404 decision is
// the single line `if (!partner) notFound()`, driven by `getReferralPartnerByAccessToken()`.
// `tests/referral-partners.test.ts` already asserts that function's behavior for an invalid
// token pattern and for a well-formed-but-unknown token (both resolve to `null`, which is
// exactly the input that makes the page call `notFound()`). `next/navigation`'s `notFound()`
// itself is unmodified framework behavior (it throws an Error with
// `digest === 'NEXT_HTTP_ERROR_FALLBACK;404'`), not DomTrack logic, so re-testing it here would
// only be testing Next.js, not this change.
