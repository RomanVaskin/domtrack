import { getDatabase } from './telegram/postgres-store.ts'
import { loadPublicOrder, type PublicOrder } from './public-orders.ts'

export type { PublicOrder } from './public-orders.ts'

export async function getOrderByClientToken(token: string): Promise<PublicOrder | null> {
  return loadPublicOrder(token, async (validToken) => {
    const rows = await getDatabase()`
      SELECT number, service_type, NULL::text AS client_phone, address, requested_date,
             requested_time, photo_report_enabled, parameters, NULL::text AS comment, status
      FROM orders WHERE client_token = ${validToken} AND status = 'confirmed'
    `
    return rows[0] ?? null
  }).catch(() => null)
}

export async function getOrderByWorkerToken(token: string): Promise<PublicOrder | null> {
  return loadPublicOrder(token, async (validToken) => {
    const rows = await getDatabase()`
      SELECT number, service_type, client_phone, address, requested_date,
             requested_time, photo_report_enabled, parameters, comment, status
      FROM orders WHERE worker_token = ${validToken} AND status = 'confirmed'
    `
    return rows[0] ?? null
  }).catch(() => null)
}
