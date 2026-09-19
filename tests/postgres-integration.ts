import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import sharp from 'sharp'
import { GET as getPhoto } from '../app/api/photos/[id]/route.ts'
import { POST as uploadPhoto } from '../app/api/photos/route.ts'
import { getOrderByClientToken, getOrderByWorkerToken } from '../lib/orders.ts'
import { acceptClientOrder } from '../lib/client-orders.ts'
import { advanceWorkerOrder } from '../lib/worker-orders.ts'
import {
  HOUSE_CLEANING_CHECKLIST,
  updateOrderChecklistItem,
} from '../lib/order-checklist.ts'
import { getDatabase, PostgresSessionStore } from '../lib/telegram/postgres-store.ts'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
process.env.DATABASE_SSL = 'false'

const sql = postgres(process.env.DATABASE_URL, { ssl: false, prepare: false })
const store = new PostgresSessionStore()

async function main() {
  const uploadDirectory = await mkdtemp(join(tmpdir(), 'domtrack-photos-test-'))
  process.env.DOMTRACK_UPLOAD_DIR = uploadDirectory
  try {
    await sql`TRUNCATE order_checklist_items, order_photos, telegram_sessions, orders RESTART IDENTITY`
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
    assert.deepEqual(await acceptClientOrder(confirmedA.clientToken), {
      ok: false,
      error: 'invalid_transition',
    })

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
    assert.deepEqual(await acceptClientOrder(confirmedA.clientToken), {
      ok: false,
      error: 'invalid_transition',
    })

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
    assert.deepEqual(await acceptClientOrder(confirmedA.clientToken), {
      ok: false,
      error: 'invalid_transition',
    })

    const image = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#447799' },
    }).png().toBuffer()
    const postPhoto = (token: string, kind: string, body: BodyInit = image, headers = {}) =>
      uploadPhoto(new Request(`http://localhost/api/photos?kind=${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png', ...headers },
        body,
      }))

    const beforeResponse = await postPhoto(confirmedA.workerToken, 'before')
    assert.equal(beforeResponse.status, 201)
    const beforePhoto = await beforeResponse.json() as { id: string; kind: string; src: string }
    assert.equal(beforePhoto.kind, 'before')
    const afterResponse = await postPhoto(confirmedA.workerToken, 'after')
    assert.equal(afterResponse.status, 201)
    const afterPhoto = await afterResponse.json() as { id: string; kind: string }
    assert.equal(afterPhoto.kind, 'after')

    assert.equal((await postPhoto(confirmedA.clientToken, 'before')).status, 404)
    assert.equal((await postPhoto('x'.repeat(32), 'before')).status, 404)
    assert.equal((await postPhoto(confirmedA.workerToken, 'other')).status, 404)
    assert.equal((await postPhoto(confirmedA.workerToken, 'before', Buffer.from('<svg/>'))).status, 415)
    assert.equal((await postPhoto(
      confirmedA.workerToken,
      'before',
      Buffer.from('small'),
      { 'content-length': String(50 * 1024 * 1024 + 1) },
    )).status, 413)

    const storedPhotos = await sql`
      SELECT order_id, kind, storage_path FROM order_photos ORDER BY created_at, id
    `
    assert.deepEqual(storedPhotos.map((photo) => photo.kind), ['before', 'after'])
    assert.ok(storedPhotos.every((photo) => String(photo.order_id) === orderId))
    assert.ok(storedPhotos.every((photo) => /^[a-f0-9-]+\.jpg$/.test(String(photo.storage_path))))

    const served = await getPhoto(new Request('http://localhost'), {
      params: Promise.resolve({ id: beforePhoto.id }),
    })
    assert.equal(served.status, 200)
    assert.equal(served.headers.get('content-type'), 'image/jpeg')
    const servedMetadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata()
    assert.equal(servedMetadata.format, 'jpeg')
    assert.ok((servedMetadata.width ?? Infinity) <= 2400)
    assert.equal((await getPhoto(new Request('http://localhost'), {
      params: Promise.resolve({ id: '99999999-9999-9999-9999-999999999999' }),
    })).status, 404)
    assert.equal((await getPhoto(new Request('http://localhost'), {
      params: Promise.resolve({ id: '../README.md' }),
    })).status, 404)

    const originalPath = String(storedPhotos[0].storage_path)
    await sql`UPDATE order_photos SET storage_path = '../README.md' WHERE id = ${beforePhoto.id}::uuid`
    assert.equal((await getPhoto(new Request('http://localhost'), {
      params: Promise.resolve({ id: beforePhoto.id }),
    })).status, 404)
    await sql`UPDATE order_photos SET storage_path = ${originalPath} WHERE id = ${beforePhoto.id}::uuid`

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
    assert.equal((await postPhoto(confirmedA.workerToken, 'after')).status, 409)

    const completedClientOrder = await getOrderByClientToken(confirmedA.clientToken)
    const completedWorkerOrder = await getOrderByWorkerToken(confirmedA.workerToken)
    assert.equal(completedClientOrder?.status, 'completed')
    assert.equal(completedClientOrder?.workerName, 'Исполнитель')
    assert.equal(completedWorkerOrder?.status, 'completed')

    assert.deepEqual(await acceptClientOrder(confirmedA.workerToken), {
      ok: false,
      error: 'not_found',
    })
    assert.deepEqual(await acceptClientOrder('x'.repeat(32)), {
      ok: false,
      error: 'not_found',
    })
    state = (await sql`SELECT status, accepted_at FROM orders WHERE id = ${orderId}::bigint`)[0]
    assert.equal(state.status, 'completed')
    assert.equal(state.accepted_at, null)

    const [acceptance, concurrentAcceptance] = await Promise.all([
      acceptClientOrder(confirmedA.clientToken),
      acceptClientOrder(confirmedA.clientToken),
    ])
    assert.equal(acceptance.ok, true)
    if (!acceptance.ok) throw new Error('acceptance failed')
    assert.equal(acceptance.status, 'accepted')
    assert.ok(acceptance.acceptedAt)
    assert.deepEqual(concurrentAcceptance, acceptance)
    assert.deepEqual(await acceptClientOrder(confirmedA.clientToken), acceptance)
    state = (await sql`SELECT status, completed_at, accepted_at FROM orders WHERE id = ${orderId}::bigint`)[0]
    assert.equal(state.status, 'accepted')
    assert.equal(state.completed_at.toISOString(), completedAt)
    assert.equal(state.accepted_at.toISOString(), acceptance.acceptedAt)
    assert.deepEqual(await acceptClientOrder('invalid'), {
      ok: false,
      error: 'not_found',
    })

    const clientOrder = await getOrderByClientToken(confirmedA.clientToken)
    const workerOrder = await getOrderByWorkerToken(confirmedA.workerToken)
    assert.equal(clientOrder?.number, 'DT-000001')
    assert.equal(clientOrder?.clientPhone, null)
    assert.equal(workerOrder?.number, 'DT-000001')
    assert.equal(workerOrder?.clientPhone, '+79990000000')
    assert.deepEqual(clientOrder?.photos.map((photo) => photo.kind), ['before', 'after'])
    assert.deepEqual(workerOrder?.photos.map((photo) => photo.kind), ['before', 'after'])
    assert.equal(clientOrder?.status, 'accepted')
    assert.equal(clientOrder?.acceptedAt, acceptance.acceptedAt)
    assert.equal(workerOrder?.status, 'accepted')
    assert.equal(workerOrder?.acceptedAt, acceptance.acceptedAt)
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

    const rejectedClientToken = 'q'.repeat(32)
    await sql`UPDATE orders SET client_token = ${rejectedClientToken} WHERE id = ${second.id}`
    assert.deepEqual(await acceptClientOrder(rejectedClientToken), {
      ok: false,
      error: 'invalid_transition',
    })

    const rejectedWorkerToken = 'r'.repeat(32)
    await sql`UPDATE orders SET worker_token = ${rejectedWorkerToken} WHERE id = ${second.id}`
    assert.deepEqual(await advanceWorkerOrder(rejectedWorkerToken, 'leave'), {
      ok: false,
      error: 'invalid_transition',
    })

    const states = await sql`
      SELECT status, confirmed_at, rejected_at, assigned_at, on_the_way_at, started_at,
             completed_at, accepted_at
      FROM orders ORDER BY id
    `
    assert.equal(states[0].status, 'accepted')
    assert.ok(states[0].confirmed_at)
    assert.ok(states[0].assigned_at)
    assert.ok(states[0].on_the_way_at)
    assert.ok(states[0].started_at)
    assert.ok(states[0].completed_at)
    assert.ok(states[0].accepted_at)
    assert.equal(states[0].rejected_at, null)
    assert.equal(states[1].status, 'rejected')
    assert.ok(states[1].rejected_at)
    assert.equal(states[1].confirmed_at, null)
    assert.equal(states[1].assigned_at, null)
    assert.equal(states[1].on_the_way_at, null)
    assert.equal(states[1].started_at, null)
    assert.equal(states[1].completed_at, null)
    const noReportToken = 'n'.repeat(32)
    await sql`
      INSERT INTO orders (
        telegram_chat_id, service_type, client_name, client_phone, address,
        requested_date, requested_time, photo_report_enabled, parameters,
        status, source_session_id, worker_token
      ) VALUES (
        44, 'house_cleaning', 'Нет фото', '+79990000002', 'Адрес 3',
        '2026-09-22', '09:00–12:00', false, '{}'::jsonb,
        'in_progress', 'integration-no-photo', ${noReportToken}
      )
    `
    assert.equal((await postPhoto(noReportToken, 'before')).status, 409)

    const houseWorkerToken = 'h'.repeat(32)
    const houseClientToken = 'c'.repeat(32)
    const [house] = await sql`
      INSERT INTO orders (
        telegram_chat_id, service_type, client_name, client_phone, address,
        requested_date, requested_time, photo_report_enabled, parameters,
        status, source_session_id, worker_token, client_token, worker_name, assigned_at
      ) VALUES (
        45, 'house_cleaning', 'Дом', '+79990000003', 'Адрес 4',
        '2026-09-23', '10:00–13:00', true, '{}'::jsonb,
        'assigned', 'integration-checklist', ${houseWorkerToken}, ${houseClientToken},
        'Исполнитель', now()
      )
      RETURNING id
    `
    const houseId = String(house.id)
    assert.equal((await sql`
      SELECT count(*)::int AS count FROM order_checklist_items WHERE order_id = ${houseId}::bigint
    `)[0].count, 0)
    assert.deepEqual(await advanceWorkerOrder(houseWorkerToken, 'leave'), {
      ok: true,
      status: 'on_the_way',
    })
    assert.deepEqual(await advanceWorkerOrder(houseWorkerToken, 'start'), {
      ok: true,
      status: 'in_progress',
    })

    let checklistRows = await sql`
      SELECT id, title, position, completed, completed_at
      FROM order_checklist_items
      WHERE order_id = ${houseId}::bigint
      ORDER BY position
    `
    assert.equal(checklistRows.length, 8)
    assert.deepEqual(checklistRows.map((item) => item.title), [...HOUSE_CLEANING_CHECKLIST])
    assert.ok(checklistRows.every((item) => item.completed === false && item.completed_at === null))
    assert.deepEqual(await advanceWorkerOrder(houseWorkerToken, 'start'), {
      ok: true,
      status: 'in_progress',
    })
    assert.equal((await sql`
      SELECT count(*)::int AS count FROM order_checklist_items WHERE order_id = ${houseId}::bigint
    `)[0].count, 8)

    const checklistItemId = String(checklistRows[0].id)
    const secondChecklistItemId = String(checklistRows[1].id)
    const postChecklistPhoto = (token: string, itemId: string, body: BodyInit = image) =>
      uploadPhoto(new Request(`http://localhost/api/photos?checklist_item_id=${itemId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
        body,
      }))

    assert.equal((await postChecklistPhoto('x'.repeat(32), checklistItemId)).status, 404)
    assert.equal((await postChecklistPhoto(houseClientToken, checklistItemId)).status, 404)
    assert.equal((await postChecklistPhoto(houseWorkerToken, '999999999999')).status, 404)

    const otherHouseItem = (await sql`
      INSERT INTO order_checklist_items (order_id, title, position)
      SELECT id, 'Чужой пункт', 1 FROM orders WHERE worker_token = ${noReportToken}
      RETURNING id
    `)[0]
    assert.equal((await postChecklistPhoto(houseWorkerToken, String(otherHouseItem.id))).status, 404)

    const lawnToken = 'l'.repeat(32)
    const [lawn] = await sql`
      INSERT INTO orders (
        telegram_chat_id, service_type, client_name, client_phone, address,
        requested_date, requested_time, photo_report_enabled, parameters,
        status, source_session_id, worker_token
      ) VALUES (
        46, 'lawn_mowing', 'Газон', '+79990000004', 'Адрес 5',
        '2026-09-24', '10:00–13:00', true, '{}'::jsonb,
        'in_progress', 'integration-wrong-service', ${lawnToken}
      ) RETURNING id
    `
    const [lawnItem] = await sql`
      INSERT INTO order_checklist_items (order_id, title, position)
      VALUES (${String(lawn.id)}::bigint, 'Не уборка', 1) RETURNING id
    `
    assert.equal((await postChecklistPhoto(lawnToken, String(lawnItem.id))).status, 409)
    await sql`DELETE FROM orders WHERE id = ${String(lawn.id)}::bigint`

    const firstItemPhotoResponse = await postChecklistPhoto(houseWorkerToken, checklistItemId)
    assert.equal(firstItemPhotoResponse.status, 201)
    const firstItemPhoto = await firstItemPhotoResponse.json() as { id: string; checklistItemId: string; kind: string }
    assert.equal(firstItemPhoto.kind, 'checklist')
    assert.equal(firstItemPhoto.checklistItemId, checklistItemId)
    const secondFirstItemPhotoResponse = await postChecklistPhoto(houseWorkerToken, checklistItemId)
    assert.equal(secondFirstItemPhotoResponse.status, 201)
    const secondFirstItemPhoto = await secondFirstItemPhotoResponse.json() as { id: string }
    const secondItemPhotoResponse = await postChecklistPhoto(houseWorkerToken, secondChecklistItemId)
    assert.equal(secondItemPhotoResponse.status, 201)
    const secondItemPhoto = await secondItemPhotoResponse.json() as { id: string }

    const checklistPhotoRows = await sql`
      SELECT id, order_id, kind, checklist_item_id, storage_path
      FROM order_photos
      WHERE order_id = ${houseId}::bigint
      ORDER BY created_at, id
    `
    assert.equal(checklistPhotoRows.length, 3)
    assert.ok(checklistPhotoRows.every((photo) => photo.kind === 'checklist'))
    assert.ok(checklistPhotoRows.every((photo) => String(photo.order_id) === houseId))
    assert.deepEqual(
      checklistPhotoRows.map((photo) => String(photo.checklist_item_id)),
      [checklistItemId, checklistItemId, secondChecklistItemId],
    )
    assert.equal(new Set(checklistPhotoRows.map((photo) => photo.storage_path)).size, 3)

    const checked = await updateOrderChecklistItem(houseWorkerToken, checklistItemId, true)
    assert.equal(checked.ok, true)
    if (!checked.ok) throw new Error('checklist update failed')
    assert.equal(checked.completed, true)
    assert.ok(checked.completedAt)
    let checklistItem = (await sql`
      SELECT completed, completed_at FROM order_checklist_items WHERE id = ${checklistItemId}::bigint
    `)[0]
    assert.equal(checklistItem.completed, true)
    assert.ok(checklistItem.completed_at)

    const unchecked = await updateOrderChecklistItem(houseWorkerToken, checklistItemId, false)
    assert.deepEqual(unchecked, { ok: true, completed: false, completedAt: null })
    checklistItem = (await sql`
      SELECT completed, completed_at FROM order_checklist_items WHERE id = ${checklistItemId}::bigint
    `)[0]
    assert.equal(checklistItem.completed, false)
    assert.equal(checklistItem.completed_at, null)

    assert.deepEqual(await updateOrderChecklistItem('x'.repeat(32), checklistItemId, true), {
      ok: false,
      error: 'not_found',
    })
    assert.deepEqual(await updateOrderChecklistItem(houseClientToken, checklistItemId, true), {
      ok: false,
      error: 'not_found',
    })
    assert.deepEqual(await updateOrderChecklistItem(noReportToken, checklistItemId, true), {
      ok: false,
      error: 'not_found',
    })
    checklistItem = (await sql`
      SELECT completed FROM order_checklist_items WHERE id = ${checklistItemId}::bigint
    `)[0]
    assert.equal(checklistItem.completed, false)

    assert.deepEqual(await updateOrderChecklistItem(houseWorkerToken, checklistItemId, true), {
      ok: true,
      completed: true,
      completedAt: (await sql`
        SELECT completed_at FROM order_checklist_items WHERE id = ${checklistItemId}::bigint
      `)[0].completed_at.toISOString(),
    })
    const inProgressClientOrder = await getOrderByClientToken(houseClientToken)
    assert.equal(inProgressClientOrder?.serviceType, 'house_cleaning')
    assert.equal(inProgressClientOrder?.checklist.length, 8)
    assert.equal(inProgressClientOrder?.checklist.filter((item) => item.completed).length, 1)
    assert.deepEqual(inProgressClientOrder?.checklist.map((item) => item.photos.map((photo) => photo.id)), [
      [firstItemPhoto.id, secondFirstItemPhoto.id],
      [secondItemPhoto.id],
      [], [], [], [], [], [],
    ])
    assert.equal(inProgressClientOrder?.photos.length, 0)
    const inProgressWorkerOrder = await getOrderByWorkerToken(houseWorkerToken)
    assert.equal(inProgressWorkerOrder?.checklist.length, 8)
    assert.equal(inProgressWorkerOrder?.checklist.flatMap((item) => item.photos).length, 3)

    assert.deepEqual(await advanceWorkerOrder(houseWorkerToken, 'complete'), {
      ok: true,
      status: 'completed',
    })
    assert.deepEqual(await updateOrderChecklistItem(houseWorkerToken, checklistItemId, false), {
      ok: false,
      error: 'not_editable',
    })
    assert.equal((await postChecklistPhoto(houseWorkerToken, checklistItemId)).status, 409)
    assert.equal((await getOrderByClientToken(houseClientToken))?.checklist[0].completed, true)
    const houseAcceptance = await acceptClientOrder(houseClientToken)
    assert.equal(houseAcceptance.ok, true)
    assert.equal((await postChecklistPhoto(houseWorkerToken, checklistItemId)).status, 409)
    assert.deepEqual(await updateOrderChecklistItem(houseWorkerToken, checklistItemId, false), {
      ok: false,
      error: 'not_editable',
    })
    checklistRows = await sql`
      SELECT completed FROM order_checklist_items WHERE order_id = ${houseId}::bigint ORDER BY position
    `
    assert.equal(checklistRows.filter((item) => item.completed).length, 1)

    assert.equal((await getOrderByWorkerToken(confirmedA.workerToken))?.checklist.length, 0)
    assert.equal((await sql`
      SELECT count(*)::int AS count
      FROM order_checklist_items i
      JOIN orders o ON o.id = i.order_id
      WHERE o.service_type <> 'house_cleaning'
    `)[0].count, 0)

    console.log('PASS: PostgreSQL lifecycle, checklist, photo upload/auth/isolation/serving, row locks, timestamps, idempotency')
  } finally {
    await sql.end()
    await getDatabase().end()
    await rm(uploadDirectory, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
