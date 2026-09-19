import { readStoredPhoto, UUID_PATTERN } from '../../../../lib/photo-storage.ts'
import { getDatabase } from '../../../../lib/telegram/postgres-store.ts'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const missing = () => new Response(null, { status: 404 })
  const { id } = await context.params
  if (!UUID_PATTERN.test(id)) return missing()

  try {
    const rows = await getDatabase()`
      SELECT storage_path
      FROM order_photos
      WHERE id = ${id}::uuid
    `
    if (!rows[0]) return missing()
    const { bytes, type } = await readStoredPhoto(String(rows[0].storage_path))
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': type,
        'Content-Length': String(bytes.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return missing()
  }
}
