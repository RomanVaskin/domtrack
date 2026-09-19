'use client'

import { useState } from 'react'
import { PhotoViewer } from './photo-viewer'
import type { OrderPhoto, OrderPhotoKind } from '@/lib/public-orders'

export function OrderPhotoGallery({ photos }: { photos: OrderPhoto[] }) {
  const [viewer, setViewer] = useState<OrderPhoto | null>(null)

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-foreground">Фото работы</h2>
        <div className="mt-4 space-y-5">
          <PhotoGroup kind="before" title="До" photos={photos} onOpen={setViewer} />
          <PhotoGroup kind="after" title="После" photos={photos} onOpen={setViewer} />
        </div>
      </section>
      {viewer && <PhotoViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </>
  )
}

export function PhotoGroup({
  kind,
  title,
  photos,
  onOpen,
}: {
  kind: OrderPhotoKind
  title: string
  photos: OrderPhoto[]
  onOpen: (photo: OrderPhoto) => void
}) {
  const matching = photos.filter((photo) => photo.kind === kind)
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {matching.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {matching.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onOpen(photo)}
              className="aspect-square overflow-hidden rounded-xl border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} alt={photo.alt} className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Пока нет фото</p>
      )}
    </div>
  )
}
