import { addOrderChecklistPhoto, addOrderPhoto } from '../../../lib/order-photos.ts'
import { MAX_PHOTO_BYTES, photoUploadError } from '../../../lib/photo-upload.ts'
import { PhotoInputError } from '../../../lib/photo-storage.ts'
import type { GlobalOrderPhotoKind } from '../../../lib/public-orders.ts'

export const runtime = 'nodejs'

function failureReason(error: unknown): string {
  const reasons = new Set([
    'Source photo exceeds 50 MiB',
    'Unsupported or invalid image',
    'Upload directory required',
    'Invalid storage identifier',
  ])
  if (error instanceof Error && reasons.has(error.message)) return error.message
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (typeof code === 'string' && /^(EACCES|EPERM|ENOSPC|ENOENT|EROFS|EMFILE|EIO|ECONNREFUSED|ECONNRESET|ETIMEDOUT|28P01|23503|23505|42P01|53300|57P01)$/.test(code)) {
    return `Storage/database error: ${code}`
  }
  return 'Unexpected upload error'
}

export async function POST(request: Request) {
  const fail = (status: number, reason: string) => {
    console.error('[photo-upload]', { status, reason })
    return Response.json({ error: photoUploadError(status) }, { status })
  }
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  const checklistItemId = params.get('checklist_item_id')
  const globalTarget = (kind === 'before' || kind === 'after') && checklistItemId === null
  const checklistTarget = kind === null && checklistItemId !== null && /^\d+$/.test(checklistItemId)
  if ((!globalTarget && !checklistTarget) || !token) return fail(404, 'Invalid target')
  if (Number(request.headers.get('content-length')) > MAX_PHOTO_BYTES) {
    return fail(413, 'Source photo exceeds 50 MiB')
  }
  if (!request.body) return fail(400, 'Missing request body')

  try {
    const reader = request.body.getReader()
    const chunks: Buffer[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_PHOTO_BYTES) {
          await reader.cancel()
          return fail(413, 'Source photo exceeds 50 MiB')
        }
        chunks.push(Buffer.from(value))
      }
    } finally {
      reader.releaseLock()
    }

    const bytes = Buffer.concat(chunks)
    const result = checklistTarget
      ? await addOrderChecklistPhoto(token, checklistItemId, bytes)
      : await addOrderPhoto(token, kind as GlobalOrderPhotoKind, bytes)
    if (!result.ok) return fail(result.error === 'not_found' ? 404 : 409, result.error)
    return Response.json(result.photo, { status: 201 })
  } catch (error) {
    if (error instanceof PhotoInputError) return fail(error.status, error.message)
    return fail(400, failureReason(error))
  }
}
