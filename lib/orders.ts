import { getDatabase } from './telegram/postgres-store.ts'
import { loadPublicOrder, type PublicOrder } from './public-orders.ts'

export type { PublicOrder } from './public-orders.ts'

export async function getOrderByClientToken(token: string): Promise<PublicOrder | null> {
  return loadPublicOrder(token, async (validToken) => {
    const rows = await getDatabase()`
      SELECT number, service_type, NULL::text AS client_phone, address, requested_date,
             requested_time, photo_report_enabled, parameters, NULL::text AS comment, status,
             worker_name, confirmed_at, assigned_at, on_the_way_at, started_at, completed_at,
             accepted_at,
             COALESCE((
               SELECT json_agg(json_build_object('id', p.id, 'kind', p.kind) ORDER BY p.created_at, p.id)
               FROM order_photos p WHERE p.order_id = orders.id
             ), '[]'::json) AS photos,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', i.id::text,
                 'title', i.title,
                 'position', i.position,
                 'completed', i.completed,
                 'completed_at', i.completed_at
               ) ORDER BY i.position, i.id)
               FROM order_checklist_items i WHERE i.order_id = orders.id
             ), '[]'::json) AS checklist
      FROM orders
      WHERE client_token = ${validToken}
        AND status IN ('confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'accepted')
    `
    return rows[0] ?? null
  }).catch(() => null)
}

export async function getOrderByWorkerToken(token: string): Promise<PublicOrder | null> {
  return loadPublicOrder(token, async (validToken) => {
    const rows = await getDatabase()`
      SELECT number, service_type, client_phone, address, requested_date,
             requested_time, photo_report_enabled, parameters, comment, status,
             worker_name, confirmed_at, assigned_at, on_the_way_at, started_at, completed_at,
             accepted_at,
             COALESCE((
               SELECT json_agg(json_build_object('id', p.id, 'kind', p.kind) ORDER BY p.created_at, p.id)
               FROM order_photos p WHERE p.order_id = orders.id
             ), '[]'::json) AS photos,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', i.id::text,
                 'title', i.title,
                 'position', i.position,
                 'completed', i.completed,
                 'completed_at', i.completed_at
               ) ORDER BY i.position, i.id)
               FROM order_checklist_items i WHERE i.order_id = orders.id
             ), '[]'::json) AS checklist
      FROM orders
      WHERE worker_token = ${validToken}
        AND status IN ('confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'accepted')
    `
    return rows[0] ?? null
  }).catch(() => null)
}
