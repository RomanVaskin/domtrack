import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { loadPublicOrder } from '../lib/public-orders.ts'
import {
  CLIENT_ACCEPT_ACTION_LABEL,
  CLIENT_ACCEPTED_MESSAGE,
  CLIENT_ACCEPTED_TITLE,
  getOrderTimeline,
  getWorkerActionPresentation,
  getWorkerStatusLabel,
  showClientAcceptance,
  showClientPhotoReport,
  showWorkerPhotoReport,
} from '../lib/order-presentation.ts'

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
  accepted_at: null,
  photos: [
    { id: '11111111-1111-1111-1111-111111111111', kind: 'before' },
    { id: '22222222-2222-2222-2222-222222222222', kind: 'after' },
  ],
  checklist: [
    { id: '2', title: 'Вымыть полы', position: 2, completed: false, completed_at: null, photos: [] },
    {
      id: '1', title: 'Убрать пыль', position: 1, completed: true,
      completed_at: '2026-09-19T10:00:00.000Z',
      photos: [{
        id: '33333333-3333-3333-3333-333333333333',
        kind: 'checklist',
        checklist_item_id: '1',
      }],
    },
  ],
}
const secondRow = { ...firstRow, number: 'DT-000002', address: 'Второй адрес' }

describe('public order token access', () => {
  test('a client token returns only its matching order', async () => {
    const rows = new Map([[firstToken, firstRow], [secondToken, secondRow]])
    const order = await loadPublicOrder(firstToken, async (token) => rows.get(token) ?? null)
    assert.equal(order?.number, 'DT-000001')
    assert.equal(order?.address, 'Первый адрес')
    assert.deepEqual(order?.photos.map(({ kind, src }) => ({ kind, src })), [
      { kind: 'before', src: '/api/photos/11111111-1111-1111-1111-111111111111' },
      { kind: 'after', src: '/api/photos/22222222-2222-2222-2222-222222222222' },
    ])
    assert.deepEqual(order?.checklist, [
      {
        id: '1',
        title: 'Убрать пыль',
        position: 1,
        completed: true,
        completedAt: '2026-09-19T10:00:00.000Z',
        photos: [{
          id: '33333333-3333-3333-3333-333333333333',
          kind: 'checklist',
          src: '/api/photos/33333333-3333-3333-3333-333333333333',
          alt: 'Фото пункта чек-листа',
          checklistItemId: '1',
        }],
      },
      { id: '2', title: 'Вымыть полы', position: 2, completed: false, completedAt: null, photos: [] },
    ])
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
    ['accepted', 5],
  ] as const) {
    test(`${status} highlights the correct timeline step`, () => {
      const timeline = getOrderTimeline(status)
      assert.equal(timeline[activeIndex].state, status === 'accepted' ? 'final' : 'current')
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
    assert.equal(getWorkerActionPresentation('accepted'), null)
  })

  test('acceptance action and worker final status are presented only where intended', () => {
    assert.equal(showClientAcceptance('completed'), true)
    assert.equal(showClientAcceptance('accepted'), false)
    assert.equal(showClientAcceptance('in_progress'), false)
    assert.equal(CLIENT_ACCEPT_ACTION_LABEL, 'Принять работу')
    assert.equal(CLIENT_ACCEPTED_TITLE, 'Работа принята')
    assert.equal(CLIENT_ACCEPTED_MESSAGE, 'Спасибо! Работа завершена и принята.')
    assert.equal(getWorkerStatusLabel('completed'), 'Работа завершена')
    assert.equal(getWorkerStatusLabel('accepted'), 'Работа принята клиентом')
  })

  test('photo report visibility follows the flag and lifecycle', () => {
    assert.equal(showClientPhotoReport(true), true)
    assert.equal(showClientPhotoReport(false), false)
    assert.equal(showWorkerPhotoReport(true, 'assigned'), false)
    assert.equal(showWorkerPhotoReport(true, 'on_the_way'), false)
    assert.equal(showWorkerPhotoReport(true, 'in_progress'), true)
    assert.equal(showWorkerPhotoReport(true, 'completed'), true)
    assert.equal(showWorkerPhotoReport(true, 'accepted'), true)
    assert.equal(showWorkerPhotoReport(false, 'in_progress'), false)
  })
})
