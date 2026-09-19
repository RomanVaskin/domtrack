import type { TransactionSql } from 'postgres'
import { getDatabase } from './telegram/postgres-store.ts'

export const HOUSE_CLEANING_CHECKLIST = [
  'Убрать пыль с доступных поверхностей',
  'Пропылесосить полы',
  'Вымыть полы',
  'Убрать кухню',
  'Убрать санузел',
  'Протереть зеркала и стеклянные поверхности',
  'Собрать и вынести мусор',
  'Финальная проверка помещения',
] as const

export type UpdateChecklistItemResult =
  | { ok: true; completed: boolean; completedAt: string | null }
  | { ok: false; error: 'not_found' | 'not_editable' | 'server' }

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
const ITEM_ID_PATTERN = /^\d+$/

/** Creates the fixed MVP checklist inside the caller's order transaction. */
export async function createHouseCleaningChecklist(
  sql: TransactionSql,
  orderId: string,
): Promise<void> {
  for (const [index, title] of HOUSE_CLEANING_CHECKLIST.entries()) {
    await sql`
      INSERT INTO order_checklist_items (order_id, title, position)
      VALUES (${orderId}::bigint, ${title}, ${index + 1})
      ON CONFLICT (order_id, position) DO NOTHING
    `
  }
}

/** Resolves the order only by worker token and serializes updates with lifecycle writes. */
export async function updateOrderChecklistItem(
  token: string,
  itemId: string,
  completed: boolean,
): Promise<UpdateChecklistItemResult> {
  if (
    typeof token !== 'string'
    || !TOKEN_PATTERN.test(token)
    || typeof itemId !== 'string'
    || !ITEM_ID_PATTERN.test(itemId)
    || typeof completed !== 'boolean'
  ) return { ok: false, error: 'not_found' }

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
      if (order.service_type !== 'house_cleaning' || order.status !== 'in_progress') {
        return { ok: false, error: 'not_editable' } as const
      }

      const updated = await sql`
        UPDATE order_checklist_items
        SET completed = ${completed},
            completed_at = CASE WHEN ${completed} THEN now() ELSE NULL END
        WHERE id = ${itemId}::bigint AND order_id = ${String(order.id)}::bigint
        RETURNING completed, completed_at
      `
      const item = updated[0]
      if (!item) return { ok: false, error: 'not_found' } as const
      return {
        ok: true,
        completed: Boolean(item.completed),
        completedAt: item.completed_at instanceof Date ? item.completed_at.toISOString() : null,
      } as const
    }) as UpdateChecklistItemResult
  } catch {
    return { ok: false, error: 'server' }
  }
}
