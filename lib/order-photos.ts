import { getDatabase } from './telegram/postgres-store.ts'
import { removeStoredPhoto, savePhoto } from './photo-storage.ts'
import type { OrderPhoto, OrderPhotoKind } from './public-orders.ts'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

export type UploadOrderPhotoResult =
  | { ok: true; photo: OrderPhoto }
  | { ok: false; error: 'not_found' | 'not_allowed' }

export async function addOrderPhoto(
  workerToken: string,
  kind: OrderPhotoKind,
  bytes: Buffer,
): Promise<UploadOrderPhotoResult> {
  if (!TOKEN_PATTERN.test(workerToken) || !['before', 'after'].includes(kind)) {
    return { ok: false, error: 'not_found' }
  }

  let storagePath: string | undefined
  try {
    return await getDatabase().begin(async (sql) => {
      const rows = await sql`
        SELECT id, status, photo_report_enabled
        FROM orders
        WHERE worker_token = ${workerToken}
        FOR UPDATE
      `
      const order = rows[0]
      if (!order) return { ok: false, error: 'not_found' } as const
      if (order.status !== 'in_progress' || !order.photo_report_enabled) {
        return { ok: false, error: 'not_allowed' } as const
      }

      storagePath = await savePhoto(bytes)
      const inserted = await sql`
        INSERT INTO order_photos (order_id, kind, storage_path)
        VALUES (${order.id}, ${kind}, ${storagePath})
        RETURNING id, kind
      `
      return { ok: true, photo: mapOrderPhoto(inserted[0]) } as const
    }) as UploadOrderPhotoResult
  } catch (error) {
    if (storagePath) await removeStoredPhoto(storagePath).catch(() => {})
    throw error
  }
}

export function mapOrderPhoto(row: Record<string, unknown>): OrderPhoto {
  const id = String(row.id)
  return {
    id,
    kind: String(row.kind) as OrderPhotoKind,
    src: `/api/photos/${id}`,
    alt: String(row.kind) === 'before' ? 'Фото до выполнения работы' : 'Фото после выполнения работы',
  }
}
