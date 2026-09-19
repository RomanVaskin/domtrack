import type { OrderPhoto, OrderPhotoKind } from './public-orders'

export const MAX_PHOTO_BYTES = 50 * 1024 * 1024

export function photoUploadError(status: number) {
  return status === 413
    ? 'Фото слишком большое'
    : status === 415
      ? 'Формат фото не поддерживается'
      : 'Не удалось загрузить фото'
}

export function photoUploadMessage(error: unknown) {
  return error instanceof Error
    && ['Фото слишком большое', 'Формат фото не поддерживается'].includes(error.message)
    ? error.message
    : 'Не удалось загрузить фото'
}

export function takeSelectedPhotoFiles(
  input: Pick<HTMLInputElement, 'files' | 'value'>,
): File[] {
  const files = Array.from(input.files ?? [])
  input.value = ''
  return files
}

export async function uploadOrderPhoto(
  file: File,
  workerToken: string,
  kind: OrderPhotoKind,
): Promise<OrderPhoto> {
  if (file.size > MAX_PHOTO_BYTES) throw new Error(photoUploadError(413))
  if (!file.size) throw new Error(photoUploadError(415))

  const response = await fetch(`/api/photos?kind=${kind}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  if (!response.ok) throw new Error(photoUploadError(response.status))
  return await response.json() as OrderPhoto
}

export async function uploadOrderPhotos(
  files: readonly File[],
  workerToken: string,
  kind: OrderPhotoKind,
  onUploaded: (photo: OrderPhoto) => void,
) {
  for (const file of files) {
    onUploaded(await uploadOrderPhoto(file, workerToken, kind))
  }
}
