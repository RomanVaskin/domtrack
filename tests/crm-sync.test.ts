import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCrmLeadPayload, type CrmSyncOrder } from '../lib/crm-lead-payload.ts'
import { syncOrderToCrm } from '../lib/crm-sync.ts'

const order: CrmSyncOrder = {
  number: 'DT-000123',
  leadTrackingId: '11111111-1111-4111-8111-111111111111',
  clientName: 'Иван',
  clientPhone: '+79990000000',
  service: 'Уборка дома',
  message: '🧹 Новая заявка DT-000123\n\nУслуга: Уборка дома',
}

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(patch)) saved[k] = process.env[k]
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('buildCrmLeadPayload produces the correct CRM payload for a new order', () => {
  const payload = buildCrmLeadPayload(order)
  assert.deepEqual(payload, {
    project: 'domtrack',
    name: 'Иван',
    phone: '+79990000000',
    source: 'Telegram',
    channel: 'Telegram',
    service: 'Уборка дома',
    message: order.message,
    lead_tracking_id: '11111111-1111-4111-8111-111111111111',
  })
})

test('the same order always builds the same lead_tracking_id; a different order never does', () => {
  assert.equal(buildCrmLeadPayload(order).lead_tracking_id, buildCrmLeadPayload(order).lead_tracking_id)
  const other = { ...order, leadTrackingId: '22222222-2222-4222-8222-222222222222' }
  assert.notEqual(buildCrmLeadPayload(order).lead_tracking_id, buildCrmLeadPayload(other).lead_tracking_id)
})

test('missing OLNOO_CRM_URL/OLNOO_CRM_API_KEY: syncOrderToCrm resolves quietly, never throws', async () => {
  await withEnv({ OLNOO_CRM_URL: undefined, OLNOO_CRM_API_KEY: undefined }, async () => {
    await assert.doesNotReject(() => syncOrderToCrm(order))
  })
})

test('a configured CRM: syncOrderToCrm POSTs the exact built payload to /api/leads/inbound with the API key', async (t) => {
  await withEnv({ OLNOO_CRM_URL: 'https://admin.olnoo.com', OLNOO_CRM_API_KEY: 'test-key' }, async () => {
    const requests: { url: string; init: RequestInit }[] = []
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), init })
      return new Response(JSON.stringify({ ok: true }), { status: 201 })
    })
    await syncOrderToCrm(order)
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.equal(request.url, 'https://admin.olnoo.com/api/leads/inbound')
    assert.equal(request.init.method, 'POST')
    assert.equal((request.init.headers as Record<string, string>).Authorization, 'Bearer test-key')
    assert.deepEqual(JSON.parse(String(request.init.body)), buildCrmLeadPayload(order))
  })
})

test('a Telegram order — same request replayed — would hit the CRM\'s own ON CONFLICT dedup: syncOrderToCrm never varies its lead_tracking_id across retries, so a redelivered update never looks like a new lead', async (t) => {
  await withEnv({ OLNOO_CRM_URL: 'https://admin.olnoo.com', OLNOO_CRM_API_KEY: 'test-key' }, async () => {
    const bodies: string[] = []
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body))
      return new Response(JSON.stringify({ ok: true }), { status: 201 })
    })
    await syncOrderToCrm(order)
    await syncOrderToCrm(order)
    assert.equal(bodies.length, 2)
    assert.equal(JSON.parse(bodies[0]).lead_tracking_id, JSON.parse(bodies[1]).lead_tracking_id)
  })
})

test('a CRM HTTP error does not throw — the DomTrack order it follows must still be safe', async (t) => {
  await withEnv({ OLNOO_CRM_URL: 'https://admin.olnoo.com', OLNOO_CRM_API_KEY: 'test-key' }, async () => {
    t.mock.method(globalThis, 'fetch', async () => new Response('server error', { status: 500 }))
    await assert.doesNotReject(() => syncOrderToCrm(order))
  })
})

test('a network failure does not throw', async (t) => {
  await withEnv({ OLNOO_CRM_URL: 'https://admin.olnoo.com', OLNOO_CRM_API_KEY: 'test-key' }, async () => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('network down')
    })
    await assert.doesNotReject(() => syncOrderToCrm(order))
  })
})
