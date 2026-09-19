'use client'

import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PhotoGroup } from './order-photo-gallery'
import { PhotoViewer } from './photo-viewer'
import {
  photoUploadMessage,
  takeSelectedPhotoFiles,
  uploadOrderPhotos,
} from '@/lib/photo-upload'
import type { OrderPhoto, OrderPhotoKind, TrackableOrderStatus } from '@/lib/public-orders'

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

  async function upload(files: readonly File[]) {
    const kind = target.current
    setUploading(kind)
    setError(null)
    try {
      await uploadOrderPhotos(files, token, kind, (photo) => {
        setPhotos((current) => [...current, photo])
      })
    } catch (uploadError) {
      setError(photoUploadMessage(uploadError))
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
            accept="image/*"
            multiple
            className="hidden"
            aria-label="Выбрать фото"
            onChange={(event) => {
              const files = takeSelectedPhotoFiles(event.currentTarget)
              if (files.length) void upload(files)
            }}
          />
        )}
      </section>
      {viewer && <PhotoViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </>
  )
}
