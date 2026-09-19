'use client'

import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PhotoGroup } from './order-photo-gallery'
import { PhotoViewer } from './photo-viewer'
import { uploadOrderPhoto } from '@/lib/photo-upload'
import type { OrderPhoto, OrderPhotoKind, TrackableOrderStatus } from '@/lib/public-orders'

const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif'

export function WorkerPhotos({
  token,
  status,
  initialPhotos,
}: {
  token: string
  status: TrackableOrderStatus
  initialPhotos: OrderPhoto[]
}) {
  const [photos, setPhotos] = useState(initialPhotos)
  const [viewer, setViewer] = useState<OrderPhoto | null>(null)
  const [uploading, setUploading] = useState<OrderPhotoKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<OrderPhotoKind>('before')
  const editable = status === 'in_progress'

  function choose(kind: OrderPhotoKind) {
    target.current = kind
    input.current?.click()
  }

  async function upload(files: FileList) {
    const kind = target.current
    setUploading(kind)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const photo = await uploadOrderPhoto(file, token, kind)
        setPhotos((current) => [...current, photo])
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить фото')
    } finally {
      setUploading(null)
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-foreground">Фотоотчёт</h2>
        <div className="mt-4 space-y-6">
          {(['before', 'after'] as const).map((kind) => (
            <div key={kind}>
              <PhotoGroup
                kind={kind}
                title={kind === 'before' ? 'Фото до' : 'Фото после'}
                photos={photos}
                onOpen={setViewer}
              />
              {editable && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading !== null}
                  onClick={() => choose(kind)}
                  className="mt-3 min-h-12 w-full rounded-xl"
                >
                  <Camera className="size-4" />
                  {uploading === kind ? 'Загрузка…' : 'Добавить фото'}
                </Button>
              )}
            </div>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 text-center text-sm text-destructive">{error}</p>}
        {editable && (
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_IMAGES}
            multiple
            className="hidden"
            aria-label="Выбрать фото"
            onChange={(event) => {
              const files = event.target.files
              event.target.value = ''
              if (files?.length) void upload(files)
            }}
          />
        )}
      </section>
      {viewer && <PhotoViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </>
  )
}
