import { getDatabase } from './telegram/postgres-store.ts'

export type AcceptClientOrderResult =
  | { ok: true; status: 'accepted'; acceptedAt: string }
  | { ok: false; error: 'not_found' | 'invalid_transition' | 'server' }

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

export async function acceptClientOrder(token: string): Promise<AcceptClientOrderResult> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    return { ok: false, error: 'not_found' }
  }

  try {
    return await getDatabase().begin(async (sql) => {
      const rows = await sql`
        SELECT id, status, accepted_at
        FROM orders
        WHERE client_token = ${token}
        FOR UPDATE
      `
      const order = rows[0]
      if (!order) return { ok: false, error: 'not_found' } as const

      if (order.status === 'accepted') {
        if (!(order.accepted_at instanceof Date)) {
          return { ok: false, error: 'server' } as const
        }
        return {
          ok: true,
          status: 'accepted',
          acceptedAt: order.accepted_at.toISOString(),
        } as const
      }
      if (order.status !== 'completed') {
        return { ok: false, error: 'invalid_transition' } as const
      }

      const updated = await sql`
        UPDATE orders
        SET status = 'accepted', accepted_at = now()
        WHERE id = ${order.id} AND status = 'completed'
        RETURNING accepted_at
      `
      if (!(updated[0]?.accepted_at instanceof Date)) {
        return { ok: false, error: 'invalid_transition' } as const
      }
      return {
        ok: true,
        status: 'accepted',
        acceptedAt: updated[0].accepted_at.toISOString(),
      } as const
    }) as AcceptClientOrderResult
  } catch {
    return { ok: false, error: 'server' }
  }
}
