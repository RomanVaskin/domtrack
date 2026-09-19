import { getDatabase } from './telegram/postgres-store.ts'
import { createHouseCleaningChecklist } from './order-checklist.ts'
import type { TrackableOrderStatus } from './public-orders.ts'

export type WorkerAction = 'leave' | 'start' | 'complete'

export type WorkerActionResult =
  | { ok: true; status: TrackableOrderStatus }
  | { ok: false; error: 'not_found' | 'invalid_transition' | 'server' }

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

const transitions: Record<WorkerAction, {
  from: TrackableOrderStatus
  to: TrackableOrderStatus
}> = {
  leave: { from: 'assigned', to: 'on_the_way' },
  start: { from: 'on_the_way', to: 'in_progress' },
  complete: { from: 'in_progress', to: 'completed' },
}

export async function advanceWorkerOrder(
  token: string,
  action: WorkerAction,
): Promise<WorkerActionResult> {
  if (!TOKEN_PATTERN.test(token) || !Object.hasOwn(transitions, action)) {
    return { ok: false, error: 'not_found' }
  }

  const transition = transitions[action]
  try {
    return await getDatabase().begin(async (sql) => {
      const rows = await sql`
        SELECT id, service_type, status
        FROM orders
        WHERE worker_token = ${token}
        FOR UPDATE
      `
      const order = rows[0]
      if (!order) return { ok: false, error: 'not_found' } as const

      const status = String(order.status) as TrackableOrderStatus
      if (status === transition.to) {
        if (action === 'start' && order.service_type === 'house_cleaning') {
          await createHouseCleaningChecklist(sql, String(order.id))
        }
        return { ok: true, status } as const
      }
      if (status !== transition.from) {
        return { ok: false, error: 'invalid_transition' } as const
      }

      const updated = await sql`
        UPDATE orders
        SET status = ${transition.to},
            on_the_way_at = CASE
              WHEN ${transition.to} = 'on_the_way' THEN COALESCE(on_the_way_at, now())
              ELSE on_the_way_at
            END,
            started_at = CASE
              WHEN ${transition.to} = 'in_progress' THEN COALESCE(started_at, now())
              ELSE started_at
            END,
            completed_at = CASE
              WHEN ${transition.to} = 'completed' THEN COALESCE(completed_at, now())
              ELSE completed_at
            END
        WHERE worker_token = ${token} AND status = ${transition.from}
        RETURNING status
      `
      if (!updated[0]) return { ok: false, error: 'invalid_transition' } as const
      if (action === 'start' && order.service_type === 'house_cleaning') {
        await createHouseCleaningChecklist(sql, String(order.id))
      }
      return { ok: true, status: String(updated[0].status) as TrackableOrderStatus } as const
    }) as WorkerActionResult
  } catch {
    return { ok: false, error: 'server' }
  }
}
