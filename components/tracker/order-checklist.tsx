'use client'

import { Camera, Check, Circle } from 'lucide-react'
import { useRef, useState } from 'react'
import { setChecklistItemCompleted } from '@/app/worker/actions'
import { Button } from '@/components/ui/button'
import { photoUploadMessage, takeSelectedPhotoFiles, uploadChecklistPhoto } from '@/lib/photo-upload'
import type { OrderChecklistItem, OrderPhoto, TrackableOrderStatus } from '@/lib/public-orders'
import { cn } from '@/lib/utils'
import { PhotoViewer } from './photo-viewer'

export function WorkerChecklist({ token, status, initialItems }: {
  token: string
  status: TrackableOrderStatus
  initialItems: OrderChecklistItem[]
}) {
  const [items, setItems] = useState(initialItems)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<OrderPhoto | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<string | null>(null)
  const editable = status === 'in_progress'

  async function toggle(item: OrderChecklistItem) {
    if (!editable || pendingIds.has(item.id)) return
    const completed = !item.completed
    setError(null)
    setPendingIds((current) => new Set(current).add(item.id))
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, completed } : entry))
    const result = await setChecklistItemCompleted(token, item.id, completed)
    setPendingIds((current) => {
      const next = new Set(current)
      next.delete(item.id)
      return next
    })
    if (!result.ok) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, completed: item.completed } : entry))
      setError('Не удалось сохранить пункт. Состояние обновлено обратно.')
      return
    }
    setItems((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, completed: result.completed, completedAt: result.completedAt }
      : entry))
  }

  function choosePhoto(itemId: string) {
    photoTarget.current = itemId
    input.current?.click()
  }

  async function upload(files: readonly File[]) {
    const itemId = photoTarget.current
    if (!itemId || !editable || uploadingItemId) return
    setUploadingItemId(itemId)
    setError(null)
    try {
      for (const file of files) {
        const photo = await uploadChecklistPhoto(file, token, itemId)
        setItems((current) => current.map((item) => item.id === itemId
          ? { ...item, photos: [...item.photos, photo] }
          : item))
      }
    } catch (uploadError) {
      setError(photoUploadMessage(uploadError))
    } finally {
      setUploadingItemId(null)
    }
  }

  return (
    <>
      <ChecklistCard
        title="Чек-лист уборки"
        items={items}
        editable={editable}
        pendingIds={pendingIds}
        uploadingItemId={uploadingItemId}
        onToggle={toggle}
        onChoosePhoto={choosePhoto}
        onOpenPhoto={setViewer}
        error={error}
      />
      <ChecklistPhotoGallery items={items} />
      {editable && (
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Выбрать фото пункта чек-листа"
          onChange={(event) => {
            const files = takeSelectedPhotoFiles(event.currentTarget)
            if (files.length) void upload(files)
          }}
        />
      )}
      {viewer && <PhotoViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </>
  )
}

export function ClientChecklist({ items }: { items: OrderChecklistItem[] }) {
  const [viewer, setViewer] = useState<OrderPhoto | null>(null)
  return (
    <>
      <ChecklistCard title="Ход уборки" items={items} onOpenPhoto={setViewer} />
      <ChecklistPhotoGallery items={items} />
      {viewer && <PhotoViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </>
  )
}

function ChecklistPhotoGallery({ items }: { items: OrderChecklistItem[] }) {
  const [viewer, setViewer] = useState<OrderPhoto | null>(null)
  const photos = items.flatMap((item) => item.photos.map((photo) => ({ photo, title: item.title })))
  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-foreground">Все фото</h2>
        {photos.length ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {photos.map(({ photo, title }) => (
              <figure key={photo.id} className="min-w-0">
                <button type="button" onClick={() => setViewer({ ...photo, alt: title })}
                  className="aspect-square w-full overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.src} alt={title} className="size-full object-cover" />
                </button>
                <figcaption className="mt-1 line-clamp-2 text-xs text-muted-foreground">{title}</figcaption>
              </figure>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">Пока нет фото</p>}
      </section>
      {viewer && <PhotoViewer src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </>
  )
}

function ChecklistCard({ title, items, editable = false, pendingIds = new Set<string>(),
  uploadingItemId = null, onToggle, onChoosePhoto, onOpenPhoto, error = null }: {
  title: string
  items: OrderChecklistItem[]
  editable?: boolean
  pendingIds?: Set<string>
  uploadingItemId?: string | null
  onToggle?: (item: OrderChecklistItem) => void
  onChoosePhoto?: (itemId: string) => void
  onOpenPhoto?: (photo: OrderPhoto) => void
  error?: string | null
}) {
  const done = items.filter((item) => item.completed).length
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{done} из {items.length} выполнено</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar"
        aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
        <div className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="mt-4 overflow-hidden rounded-xl border border-border">
        {items.map((item, index) => (
          <li key={item.id} className={cn('p-3', index > 0 && 'border-t border-border')}>
            <div className="flex min-h-11 items-center gap-3">
              {editable ? (
                <button type="button" onClick={() => onToggle?.(item)} disabled={pendingIds.has(item.id)}
                  aria-pressed={item.completed} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60">
                  <ChecklistMark completed={item.completed} />
                  <span className={cn('text-[15px] leading-snug', item.completed && 'text-muted-foreground line-through')}>
                    {item.title}
                  </span>
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ChecklistMark completed={item.completed} />
                  <span className={cn('text-[15px] leading-snug', !item.completed && 'text-muted-foreground')}>{item.title}</span>
                </div>
              )}
            </div>
            {(item.photos.length > 0 || editable) && (
              <div className="ml-10 mt-3">
                {item.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {item.photos.map((photo) => (
                      <button key={photo.id} type="button" onClick={() => onOpenPhoto?.(photo)}
                        className="aspect-square overflow-hidden rounded-lg border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.src} alt={item.title} className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {editable && (
                  <Button type="button" variant="outline" disabled={uploadingItemId !== null}
                    onClick={() => onChoosePhoto?.(item.id)} className="mt-2 min-h-10 w-full rounded-lg">
                    <Camera className="size-4" />
                    {uploadingItemId === item.id ? 'Загрузка…' : 'Добавить фото'}
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!editable && <p className="mt-3 text-xs text-muted-foreground">Чек-лист доступен только для просмотра.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  )
}

function ChecklistMark({ completed }: { completed: boolean }) {
  return completed ? (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Check className="size-5" />
    </span>
  ) : <Circle className="size-7 shrink-0 text-border" strokeWidth={2} />
}
