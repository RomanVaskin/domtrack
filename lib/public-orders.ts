import type { OrderParameters, ServiceType } from './telegram/types'

export interface PublicOrder {
  number: string
  serviceType: ServiceType
  clientPhone: string | null
  address: string
  requestedDate: string
  requestedTime: string
  photoReportEnabled: boolean
  parameters: OrderParameters
  comment: string | null
  status: 'confirmed'
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

export async function loadPublicOrder(
  token: string,
  load: (validToken: string) => Promise<Record<string, unknown> | null>,
): Promise<PublicOrder | null> {
  if (!TOKEN_PATTERN.test(token)) return null
  const row = await load(token)
  return row ? mapPublicOrder(row) : null
}

function mapPublicOrder(row: Record<string, unknown>): PublicOrder {
  return {
    number: String(row.number),
    serviceType: String(row.service_type) as ServiceType,
    clientPhone: row.client_phone === null ? null : String(row.client_phone),
    address: String(row.address),
    requestedDate: String(row.requested_date),
    requestedTime: String(row.requested_time),
    photoReportEnabled: Boolean(row.photo_report_enabled),
    parameters: row.parameters as OrderParameters,
    comment: row.comment === null ? null : String(row.comment),
    status: 'confirmed',
  }
}
