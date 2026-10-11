import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  ACCESS_TOKEN_PATTERN,
  computeCommission,
  getActiveReferralPartnerByCode,
  getReferralPartnerAdminDetailById,
  getReferralPartnerByAccessToken,
  REFERRAL_CODE_PATTERN,
  UUID_PATTERN,
} from '../lib/referral-partners.ts'
import { createFakeReferralSql } from './support/fake-referral-sql.ts'

const FORBIDDEN_PII_KEYS = [
  'clientName',
  'client_name',
  'clientPhone',
  'client_phone',
  'address',
  'telegramUsername',
  'telegram_username',
  'telegramChatId',
  'telegram_chat_id',
  'parameters',
  'comment',
  'workerName',
  'worker_name',
]

function assertNoForbiddenKeys(value: unknown, path: string = 'result'): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`))
    return
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    assert.ok(!FORBIDDEN_PII_KEYS.includes(key), `${path}.${key} must not be present (PII leak)`)
    assertNoForbiddenKeys(record[key], `${path}.${key}`)
  }
}

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

const partnerA = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Партнёр А',
  code: 'AAAA111',
  access_token: 'a'.repeat(32),
  commission_percent: 10,
  active: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
}
const partnerB = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'Партнёр Б',
  code: 'BBBB222',
  access_token: 'b'.repeat(32),
  commission_percent: 10,
  active: true,
  created_at: new Date('2026-01-02T00:00:00Z'),
}
const partnerInactive = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  name: 'Партнёр В (отключён)',
  code: 'CCCC333',
  access_token: 'c'.repeat(32),
  commission_percent: 10,
  active: false,
  created_at: new Date('2026-01-03T00:00:00Z'),
}

// Raw "orders" rows carry PII fields a real orders row would have, even though the real SQL
// (checked below) never selects them — this proves the application-level mapping strips them
// defensively, not just that the query text happens to be narrow today.
const ordersFixture = [
  {
    id: '101', number: 'DT-000101', created_at: new Date('2026-02-01T00:00:00Z'),
    total_price: 10_000, status: 'completed', referral_partner_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    client_name: 'Иван Иванов', client_phone: '+79990000000', address: 'ул. Ленина, 1',
    telegram_username: 'ivan', telegram_chat_id: '555',
    parameters: { house_area: 100 }, comment: 'секретный комментарий клиента',
  },
  {
    id: '102', number: 'DT-000102', created_at: new Date('2026-02-02T00:00:00Z'),
    total_price: null, status: 'new', referral_partner_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    client_name: 'Пётр Петров', client_phone: '+79990000001', address: 'ул. Мира, 2',
  },
  {
    id: '201', number: 'DT-000201', created_at: new Date('2026-02-03T00:00:00Z'),
    total_price: 20_000, status: 'accepted', referral_partner_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    client_name: 'Другой Клиент', client_phone: '+79990000002', address: 'ул. Победы, 3',
  },
]

function freshFixtureSql() {
  return createFakeReferralSql({
    partners: [partnerA, partnerB, partnerInactive].map((p) => ({ ...p })),
    orders: ordersFixture.map((o) => ({ ...o })),
  })
}

test('getActiveReferralPartnerByCode: an active partner code resolves', async () => {
  const result = await getActiveReferralPartnerByCode('AAAA111', freshFixtureSql())
  assert.deepEqual(result, { id: partnerA.id, code: 'AAAA111' })
})

test('getActiveReferralPartnerByCode: an unknown code resolves to null', async () => {
  const result = await getActiveReferralPartnerByCode('DOESNOTEXIST', freshFixtureSql())
  assert.equal(result, null)
})

test('getActiveReferralPartnerByCode: an inactive partner\'s code resolves to null', async () => {
  const result = await getActiveReferralPartnerByCode('CCCC333', freshFixtureSql())
  assert.equal(result, null)
})

test('getReferralPartnerByAccessToken: a partner only ever sees their own orders', async () => {
  const resultA = await getReferralPartnerByAccessToken(partnerA.access_token, freshFixtureSql())
  const resultB = await getReferralPartnerByAccessToken(partnerB.access_token, freshFixtureSql())
  assert.ok(resultA)
  assert.ok(resultB)
  assert.deepEqual(resultA.orders.map((o) => o.id).sort(), ['101', '102'])
  assert.deepEqual(resultB.orders.map((o) => o.id).sort(), ['201'])
  // Never cross-contaminated: partner A's result must not contain partner B's order, and vice versa.
  assert.ok(!resultA.orders.some((o) => o.id === '201'))
  assert.ok(!resultB.orders.some((o) => o.id === '101' || o.id === '102'))
})

test('getReferralPartnerByAccessToken: the public shape contains no client/worker PII', async () => {
  const result = await getReferralPartnerByAccessToken(partnerA.access_token, freshFixtureSql())
  assert.ok(result)
  assertNoForbiddenKeys(result)
  assert.equal(result.orders.length, 2)
})

test('getReferralPartnerByAccessToken: the public shape never contains the access token', async () => {
  const result = await getReferralPartnerByAccessToken(partnerA.access_token, freshFixtureSql())
  assert.ok(result)
  assert.equal('accessToken' in result, false)
  assert.equal('access_token' in result, false)
  assert.deepEqual(Object.keys(result).sort(), [
    'accruedCommission', 'active', 'code', 'commissionPercent',
    'completedAmount', 'id', 'name', 'orders', 'ordersCount', 'totalAmount',
  ])
})

test('getReferralPartnerByAccessToken: an invalid or unknown token resolves to null', async () => {
  // This is the exact input that makes app/partner/[token]/page.tsx call notFound() — see
  // tests/referral-route.test.ts for why that page can't be imported directly by this
  // project's test runner (no JSX transform), and why this is the nearest real boundary.
  assert.equal(await getReferralPartnerByAccessToken('not-a-real-token', freshFixtureSql()), null)
  assert.equal(await getReferralPartnerByAccessToken('d'.repeat(32), freshFixtureSql()), null)
})

test('getReferralPartnerAdminDetailById: the admin-only shape does contain the access token', async () => {
  const result = await getReferralPartnerAdminDetailById(partnerA.id, freshFixtureSql())
  assert.ok(result)
  assert.equal(result.accessToken, partnerA.access_token)
})

test('the orders query behind partner stats never selects PII columns (static regression guard)', async () => {
  const source = await readFile(new URL('../lib/referral-partners.ts', import.meta.url), 'utf8')
  const queryStart = source.indexOf('async function ordersForPartner')
  const queryEnd = source.indexOf('\n}', queryStart)
  const queryBody = source.slice(queryStart, queryEnd)
  for (const column of [
    'client_name', 'client_phone', 'address', 'telegram_username',
    'telegram_chat_id', 'parameters', 'comment', 'worker_name', 'SELECT *', 'SELECT \\*',
  ]) {
    assert.ok(!queryBody.includes(column), `ordersForPartner must not select ${column}`)
  }
})
