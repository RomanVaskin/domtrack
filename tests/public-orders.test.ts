import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { loadPublicOrder } from '../lib/public-orders.ts'
import { getOrderTimeline, getWorkerActionPresentation } from '../lib/order-presentation.ts'

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
  status: 'confirmed',
  worker_name: null,
  confirmed_at: '2026-09-19T09:00:00.000Z',
  assigned_at: null,
  on_the_way_at: null,
  started_at: null,
  completed_at: null,
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

describe('tracker presentation', () => {
  for (const [status, activeIndex] of [
    ['confirmed', 0],
    ['assigned', 1],
    ['on_the_way', 2],
    ['in_progress', 3],
    ['completed', 4],
  ] as const) {
    test(`${status} highlights the correct timeline step`, () => {
      const timeline = getOrderTimeline(status)
      assert.equal(timeline[activeIndex].state, status === 'completed' ? 'final' : 'current')
      assert.ok(timeline.slice(0, activeIndex).every((step) => step.state === 'done'))
      assert.ok(timeline.slice(activeIndex + 1).every((step) => step.state === 'todo'))
    })
  }

  test('worker actions match only the current actionable status', () => {
    assert.equal(getWorkerActionPresentation('confirmed'), null)
    assert.equal(getWorkerActionPresentation('assigned')?.label, 'Выехал')
    assert.equal(getWorkerActionPresentation('on_the_way')?.label, 'Начать работу')
    assert.equal(getWorkerActionPresentation('in_progress')?.label, 'Завершить работу')
    assert.equal(getWorkerActionPresentation('completed'), null)
  })
})
