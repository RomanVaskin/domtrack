import assert from 'node:assert/strict'
import postgres from 'postgres'
import { getOrderByClientToken, getOrderByWorkerToken } from '../lib/orders.ts'
import { advanceWorkerOrder } from '../lib/worker-orders.ts'
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

    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'start'), {
      ok: false,
      error: 'invalid_transition',
    })
    let state = (await sql`
      SELECT status, assigned_at, on_the_way_at, started_at, completed_at
      FROM orders WHERE id = ${orderId}::bigint
    `)[0]
    assert.equal(state.status, 'confirmed')
    assert.equal(state.started_at, null)

    const [assignedA, assignedB] = await Promise.all([
      store.assignOrder(orderId),
      store.assignOrder(orderId),
    ])
    assert.equal(assignedA.kind, 'assigned')
    assert.equal(assignedB.kind, 'assigned')
    state = (await sql`
      SELECT status, worker_name, assigned_at, on_the_way_at, started_at, completed_at
      FROM orders WHERE id = ${orderId}::bigint
    `)[0]
    assert.equal(state.status, 'assigned')
    assert.equal(state.worker_name, 'Исполнитель')
    assert.ok(state.assigned_at)
    const assignedAt = state.assigned_at.toISOString()
    assert.equal((await store.assignOrder(orderId)).kind, 'assigned')
    state = (await sql`SELECT assigned_at FROM orders WHERE id = ${orderId}::bigint`)[0]
    assert.equal(state.assigned_at.toISOString(), assignedAt)

    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'complete'), {
      ok: false,
      error: 'invalid_transition',
    })
    assert.deepEqual(await advanceWorkerOrder(confirmedA.clientToken, 'leave'), {
      ok: false,
      error: 'not_found',
    })
    assert.deepEqual(await advanceWorkerOrder('invalid', 'leave'), {
      ok: false,
      error: 'not_found',
    })

    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'leave'), {
      ok: true,
      status: 'on_the_way',
    })
    state = (await sql`SELECT * FROM orders WHERE id = ${orderId}::bigint`)[0]
    const onTheWayAt = state.on_the_way_at.toISOString()
    assert.equal(state.assigned_at.toISOString(), assignedAt)
    assert.equal(state.started_at, null)
    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'leave'), {
      ok: true,
      status: 'on_the_way',
    })
    state = (await sql`SELECT * FROM orders WHERE id = ${orderId}::bigint`)[0]
    assert.equal(state.on_the_way_at.toISOString(), onTheWayAt)

    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'start'), {
      ok: true,
      status: 'in_progress',
    })
    state = (await sql`SELECT * FROM orders WHERE id = ${orderId}::bigint`)[0]
    const startedAt = state.started_at.toISOString()
    assert.equal(state.on_the_way_at.toISOString(), onTheWayAt)
    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'start'), {
      ok: true,
      status: 'in_progress',
    })
    state = (await sql`SELECT * FROM orders WHERE id = ${orderId}::bigint`)[0]
    assert.equal(state.started_at.toISOString(), startedAt)

    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'complete'), {
      ok: true,
      status: 'completed',
    })
    state = (await sql`SELECT * FROM orders WHERE id = ${orderId}::bigint`)[0]
    const completedAt = state.completed_at.toISOString()
    assert.deepEqual(await advanceWorkerOrder(confirmedA.workerToken, 'complete'), {
      ok: true,
      status: 'completed',
    })
    state = (await sql`SELECT * FROM orders WHERE id = ${orderId}::bigint`)[0]
    assert.equal(state.completed_at.toISOString(), completedAt)
    assert.equal(state.started_at.toISOString(), startedAt)

    const completedClientOrder = await getOrderByClientToken(confirmedA.clientToken)
    const completedWorkerOrder = await getOrderByWorkerToken(confirmedA.workerToken)
    assert.equal(completedClientOrder?.status, 'completed')
    assert.equal(completedClientOrder?.workerName, 'Исполнитель')
    assert.equal(completedWorkerOrder?.status, 'completed')

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

    const rejectedWorkerToken = 'r'.repeat(32)
    await sql`UPDATE orders SET worker_token = ${rejectedWorkerToken} WHERE id = ${second.id}`
    assert.deepEqual(await advanceWorkerOrder(rejectedWorkerToken, 'leave'), {
      ok: false,
      error: 'invalid_transition',
    })

    const states = await sql`
      SELECT status, confirmed_at, rejected_at, assigned_at, on_the_way_at, started_at, completed_at
      FROM orders ORDER BY id
    `
    assert.equal(states[0].status, 'completed')
    assert.ok(states[0].confirmed_at)
    assert.ok(states[0].assigned_at)
    assert.ok(states[0].on_the_way_at)
    assert.ok(states[0].started_at)
    assert.ok(states[0].completed_at)
    assert.equal(states[0].rejected_at, null)
    assert.equal(states[1].status, 'rejected')
    assert.ok(states[1].rejected_at)
    assert.equal(states[1].confirmed_at, null)
    assert.equal(states[1].assigned_at, null)
    assert.equal(states[1].on_the_way_at, null)
    assert.equal(states[1].started_at, null)
    assert.equal(states[1].completed_at, null)
    console.log('PASS: PostgreSQL lifecycle, row locks, token isolation, timestamps, idempotency')
  } finally {
    await sql.end()
    await getDatabase().end()
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
