// The body DomTrack sends to the shared OLNOO CRM (`POST /api/leads/inbound`) for a confirmed
// Telegram order. Pure (no DB, no network) so it can be tested directly. DomTrack's own `orders`
// row stays the source of truth — this only carries commercially useful context into the CRM
// lead, never a copy of the order.

export type CrmSyncOrder = {
  number: string
  leadTrackingId: string
  clientName: string
  clientPhone: string
  service: string
  message: string
}

/**
 * `leadTrackingId` must already be a stable UUID unique to one order (DomTrack's own
 * `orders.source_session_id` — NOT the bigint `orders.id`). Reusing it as-is, with no new
 * tracking state in DomTrack, means the CRM's own idempotency (`insertLead`'s
 * `ON CONFLICT (lead_tracking_id)`) already guarantees one order can never become two leads or
 * two owner Telegram notifications, even if the sync is retried.
 */
export function buildCrmLeadPayload(order: CrmSyncOrder) {
  return {
    project: 'domtrack',
    name: order.clientName,
    phone: order.clientPhone,
    source: 'Telegram',
    service: order.service,
    message: order.message,
    lead_tracking_id: order.leadTrackingId,
  }
}
