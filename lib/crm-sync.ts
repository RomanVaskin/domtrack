import { buildCrmLeadPayload, type CrmSyncOrder } from './crm-lead-payload.ts'

export type { CrmSyncOrder }

// Server-side only (called from the Telegram webhook route handler). OLNOO_CRM_API_KEY must
// never reach the browser. Mirrors the exact endpoint validation DriveSet's app/api/lead/route.ts
// and CleanTrack's lib/server/crm-sync.ts use for the same CRM (https only, no
// userinfo/query/hash, local http allowed only outside production) — same OLNOO family, same rule.
function crmEndpoint(): URL | null {
  const configured = process.env.OLNOO_CRM_URL
  if (!configured || !process.env.OLNOO_CRM_API_KEY) return null
  try {
    const url = new URL(configured)
    if (url.username || url.password || url.search || url.hash) return null
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.origin.startsWith('http://127.0.0.1:'))) return null
    url.pathname = '/api/leads/inbound'
    return url
  } catch {
    return null
  }
}

/**
 * Syncs one already-committed DomTrack order to the shared OLNOO CRM. Call this only AFTER the
 * order is saved in DomTrack's own database (see lib/telegram/flow.ts's `deliver`, right after
 * `notifyAdminOfNewOrder`) — nothing here can affect that save. Never throws: a
 * missing/misconfigured CRM env, an HTTP error, or a network failure is logged (order number
 * only, no personal data) and swallowed. The owner's Telegram notification for this lead is
 * handled entirely by olnoo-admin's `createLeadRecord` — this only sends the lead, nothing more.
 */
export async function syncOrderToCrm(order: CrmSyncOrder): Promise<void> {
  const url = crmEndpoint()
  if (!url) {
    console.warn('[crm-sync] OLNOO_CRM_URL/OLNOO_CRM_API_KEY not configured — skipping CRM sync')
    return
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OLNOO_CRM_API_KEY}`,
      },
      body: JSON.stringify(buildCrmLeadPayload(order)),
      cache: 'no-store',
      signal: AbortSignal.timeout(7_000),
    })
    if (response.status !== 201) {
      const detail = (await response.text().catch(() => '')).slice(0, 200)
      console.error(`[crm-sync] CRM rejected order ${order.number}: ${response.status} ${detail}`)
    }
  } catch (error) {
    console.error(`[crm-sync] CRM request failed for order ${order.number}: ${error instanceof Error ? error.name : 'unknown'}`)
  }
}
