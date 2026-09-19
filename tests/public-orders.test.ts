import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { loadPublicOrder } from '../lib/public-orders.ts'

const firstToken = 'a'.repeat(32)
const secondToken = 'b'.repeat(32)
const firstRow = {
  number: 'DT-000001',
  service_type: 'lawn_mowing',
  client_phone: '+79990000001',
  address: 'Первый адрес',
  requested_date: '2026-09-20',
  requested_time: '12:00–15:00',
  photo_report_enabled: true,
  parameters: { lawn_area: 600 },
  comment: null,
}
const secondRow = { ...firstRow, number: 'DT-000002', address: 'Второй адрес' }

describe('public order token access', () => {
  test('a client token returns only its matching order', async () => {
    const rows = new Map([[firstToken, firstRow], [secondToken, secondRow]])
    const order = await loadPublicOrder(firstToken, async (token) => rows.get(token) ?? null)
    assert.equal(order?.number, 'DT-000001')
    assert.equal(order?.address, 'Первый адрес')
  })

  test('a worker token returns only its matching order', async () => {
    const rows = new Map([[firstToken, firstRow], [secondToken, secondRow]])
    const order = await loadPublicOrder(secondToken, async (token) => rows.get(token) ?? null)
    assert.equal(order?.number, 'DT-000002')
    assert.equal(order?.address, 'Второй адрес')
  })

  test('an invalid or unknown token returns null', async () => {
    let queried = false
    assert.equal(await loadPublicOrder('invalid', async () => { queried = true; return firstRow }), null)
    assert.equal(queried, false)
    assert.equal(await loadPublicOrder('x'.repeat(32), async () => null), null)
  })
})
