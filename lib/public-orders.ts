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
  status: TrackableOrderStatus
  workerName: string | null
  confirmedAt: string | null
  assignedAt: string | null
  onTheWayAt: string | null
  startedAt: string | null
  completedAt: string | null
}

export const TRACKABLE_ORDER_STATUSES = [
  'confirmed',
  'assigned',
  'on_the_way',
  'in_progress',
  'completed',
] as const

export type TrackableOrderStatus = (typeof TRACKABLE_ORDER_STATUSES)[number]

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
  const status = String(row.status)
  if (!TRACKABLE_ORDER_STATUSES.includes(status as TrackableOrderStatus)) {
    throw new Error('Order is not trackable')
  }
  return {
    number: String(row.number),
    serviceType: String(row.service_type) as ServiceType,
    clientPhone: nullableString(row.client_phone),
    address: String(row.address),
    requestedDate: String(row.requested_date),
    requestedTime: String(row.requested_time),
    photoReportEnabled: Boolean(row.photo_report_enabled),
    parameters: row.parameters as OrderParameters,
    comment: nullableString(row.comment),
    status: status as TrackableOrderStatus,
    workerName: nullableString(row.worker_name),
    confirmedAt: nullableDate(row.confirmed_at),
    assignedAt: nullableDate(row.assigned_at),
    onTheWayAt: nullableDate(row.on_the_way_at),
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
  }
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : String(value)
}
