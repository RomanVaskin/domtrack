import assert from 'node:assert/strict'
import test from 'node:test'
import { sendOrderToOlnooCrm } from '../lib/olnoo-crm.ts'

test('sends a DomTrack order to OLNOO CRM', async () => {
  const oldUrl = process.env.OLNOO_CRM_URL
  const oldKey = process.env.OLNOO_CRM_API_KEY
  process.env.OLNOO_CRM_URL = 'http://127.0.0.1:3140/api/leads/inbound'
  process.env.OLNOO_CRM_API_KEY = 'secret'

  let url = ''
  let init: RequestInit | undefined
  await sendOrderToOlnooCrm({
    id: '1',
    number: 'DT-1',
    telegramChatId: '123',
    serviceType: 'house_cleaning',
    clientName: 'Roman',
    clientPhone: '+70000000000',
    address: 'Истра',
    requestedDate: '2026-10-12',
    requestedTime: '12:00–15:00',
    photoReportEnabled: true,
    parameters: {},
    totalPrice: 6900,
  }, 'Уборка дома', (async (input, requestInit) => {
    url = String(input)
    init = requestInit
    return new Response('{}', { status: 201 })
  }) as typeof fetch)

  if (oldUrl === undefined) delete process.env.OLNOO_CRM_URL
  else process.env.OLNOO_CRM_URL = oldUrl
  if (oldKey === undefined) delete process.env.OLNOO_CRM_API_KEY
  else process.env.OLNOO_CRM_API_KEY = oldKey

  assert.equal(url, 'http://127.0.0.1:3140/api/leads/inbound')
  assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer secret')
  const body = JSON.parse(String(init?.body))
  assert.equal(body.project, 'domtrack')
  assert.equal(body.phone, '+70000000000')
  assert.equal(body.service, 'Уборка дома')
  assert.match(body.message, /DT-1/)
})

test('does nothing when OLNOO CRM env is not configured', async () => {
  const oldUrl = process.env.OLNOO_CRM_URL
  const oldKey = process.env.OLNOO_CRM_API_KEY
  delete process.env.OLNOO_CRM_URL
  delete process.env.OLNOO_CRM_API_KEY

  let called = false
  await sendOrderToOlnooCrm({
    id: '1',
    number: 'DT-1',
    telegramChatId: '123',
    serviceType: 'house_cleaning',
    clientName: 'Roman',
    clientPhone: '+70000000000',
    address: 'Истра',
    requestedDate: '2026-10-12',
    requestedTime: '12:00–15:00',
    photoReportEnabled: true,
    parameters: {},
    totalPrice: 6900,
  }, 'Уборка дома', (async () => {
    called = true
    return new Response('{}', { status: 201 })
  }) as typeof fetch)

  if (oldUrl === undefined) delete process.env.OLNOO_CRM_URL
  else process.env.OLNOO_CRM_URL = oldUrl
  if (oldKey === undefined) delete process.env.OLNOO_CRM_API_KEY
  else process.env.OLNOO_CRM_API_KEY = oldKey

  assert.equal(called, false)
})
