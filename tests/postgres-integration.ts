import assert from 'node:assert/strict'
import postgres from 'postgres'
import { getOrderByClientToken, getOrderByWorkerToken } from '../lib/orders.ts'
import { getDatabase, PostgresSessionStore } from '../lib/telegram/postgres-store.ts'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
process.env.DATABASE_SSL = 'false'

const sql = postgres(process.env.DATABASE_URL, { ssl: false, prepare: false })
const store = new PostgresSessionStore()

async function main() {
  try {
    await sql`TRUNCATE telegram_sessions, orders RESTART IDENTITY`
    const [first] = await sql`
    INSERT INTO orders (
      telegram_chat_id, service_type, client_name, client_phone, address,
      requested_date, requested_time, photo_report_enabled, parameters,
      status, source_session_id
    ) VALUES (
      42, 'lawn_mowing', 'Иван', '+79990000000', 'Адрес 1',
      '2026-09-20', '12:00–15:00', true,
      ${sql.json({ lawn_area: 600, collect_grass: true, remove_grass: false })},
      'new', 'integration-confirm'
    ) RETURNING id
  `
    const orderId = String(first.id)
    const [confirmedA, confirmedB] = await Promise.all([
      store.confirmOrder(orderId),
      store.confirmOrder(orderId),
    ])
    assert.equal(confirmedA.kind, 'confirmed')
    assert.equal(confirmedB.kind, 'confirmed')
    if (confirmedA.kind !== 'confirmed' || confirmedB.kind !== 'confirmed') {
      throw new Error('confirm failed')
    }
    assert.equal(confirmedA.clientToken, confirmedB.clientToken)
    assert.equal(confirmedA.workerToken, confirmedB.workerToken)
    assert.notEqual(confirmedA.clientToken, confirmedA.workerToken)
    assert.match(confirmedA.clientToken, /^[A-Za-z0-9_-]{32}$/)
    assert.match(confirmedA.workerToken, /^[A-Za-z0-9_-]{32}$/)
    assert.equal((await store.rejectOrder(orderId)).kind, 'confirmed')

    const clientOrder = await getOrderByClientToken(confirmedA.clientToken)
    const workerOrder = await getOrderByWorkerToken(confirmedA.workerToken)
    assert.equal(clientOrder?.number, 'DT-000001')
    assert.equal(clientOrder?.clientPhone, null)
    assert.equal(workerOrder?.number, 'DT-000001')
    assert.equal(workerOrder?.clientPhone, '+79990000000')
    assert.equal(await getOrderByClientToken(confirmedA.workerToken), null)
    assert.equal(await getOrderByWorkerToken(confirmedA.clientToken), null)
    assert.equal(await getOrderByClientToken('invalid'), null)

    const [second] = await sql`
    INSERT INTO orders (
      telegram_chat_id, service_type, client_name, client_phone, address,
      requested_date, requested_time, photo_report_enabled, parameters,
      status, source_session_id
    ) VALUES (
      43, 'house_cleaning', 'Анна', '+79990000001', 'Адрес 2',
      '2026-09-21', '09:00–12:00', false,
      ${sql.json({ house_area: 180, floors: 2 })},
      'new', 'integration-reject'
    ) RETURNING id
  `
    const rejectedA = await store.rejectOrder(String(second.id))
    const rejectedB = await store.rejectOrder(String(second.id))
    assert.equal(rejectedA.kind, 'rejected')
    assert.equal(rejectedB.kind, 'rejected')
    assert.equal((await store.confirmOrder(String(second.id))).kind, 'rejected')

    const states = await sql`SELECT status, confirmed_at, rejected_at FROM orders ORDER BY id`
    assert.equal(states[0].status, 'confirmed')
    assert.ok(states[0].confirmed_at)
    assert.equal(states[0].rejected_at, null)
    assert.equal(states[1].status, 'rejected')
    assert.ok(states[1].rejected_at)
    assert.equal(states[1].confirmed_at, null)
    console.log('PASS: PostgreSQL migration, row locks, token isolation, confirm/reject idempotency')
  } finally {
    await sql.end()
    await getDatabase().end()
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
