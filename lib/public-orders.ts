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
  acceptedAt: string | null
  photos: OrderPhoto[]
  checklist: OrderChecklistItem[]
}

export interface OrderChecklistItem {
  id: string
  title: string
  position: number
  completed: boolean
  completedAt: string | null
  photos: OrderPhoto[]
}

export type OrderPhotoKind = 'before' | 'after' | 'checklist'
export type GlobalOrderPhotoKind = Exclude<OrderPhotoKind, 'checklist'>

export interface OrderPhoto {
  id: string
  kind: OrderPhotoKind
  src: string
  alt: string
  checklistItemId: string | null
}

export const TRACKABLE_ORDER_STATUSES = [
  'confirmed',
  'assigned',
  'on_the_way',
  'in_progress',
  'completed',
  'accepted',
] as const

export type TrackableOrderStatus = (typeof TRACKABLE_ORDER_STATUSES)[number]

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
const ITEM_ID_PATTERN = /^\d+$/

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
    acceptedAt: nullableDate(row.accepted_at),
    photos: mapPhotos(row.photos),
    checklist: mapChecklist(row.checklist),
  }
}

function mapChecklist(value: unknown): OrderChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = String(row.id)
    const position = Number(row.position)
    if (!ITEM_ID_PATTERN.test(id) || !Number.isInteger(position) || position < 1) return []
    return [{
      id,
      title: String(row.title),
      position,
      completed: Boolean(row.completed),
      completedAt: nullableDate(row.completed_at),
      photos: mapPhotos(row.photos),
    }]
  }).sort((left, right) => left.position - right.position)
}

function mapPhotos(value: unknown): OrderPhoto[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((photo) => {
    if (!photo || typeof photo !== 'object') return []
    const row = photo as Record<string, unknown>
    const id = String(row.id)
    const kind = String(row.kind)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !['before', 'after', 'checklist'].includes(kind)) return []
    const checklistItemId = row.checklist_item_id === null || row.checklist_item_id === undefined
      ? null
      : String(row.checklist_item_id)
    if (kind === 'checklist' && (!checklistItemId || !ITEM_ID_PATTERN.test(checklistItemId))) return []
    return [{
      id,
      kind,
      src: `/api/photos/${id}`,
      alt: kind === 'before'
        ? 'Фото до выполнения работы'
        : kind === 'after' ? 'Фото после выполнения работы' : 'Фото пункта чек-листа',
      checklistItemId,
    } as OrderPhoto]
  })
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : String(value)
}
