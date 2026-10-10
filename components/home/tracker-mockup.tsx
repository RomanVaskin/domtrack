import { Camera, Check, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

// A polished preview of the real DomTrack tracker (status, executor, checklist, before/after
// photos — the same shapes as components/tracker/*.tsx and lib/order-checklist.ts), built fresh
// for the landing page so this patch never imports from or touches /o or /worker. Photos are the
// project's own existing demo assets (public/images/lawn-*.png); nothing here is invented product UI.

const TIMELINE_STEPS = ['Подтверждён', 'Назначен', 'В работе', 'Завершено']
const ACTIVE_STEP = 2

const CHECKLIST_ITEMS = [
  { label: 'Стрижка газона', done: true },
  { label: 'Уборка скошенной травы', done: true },
  { label: 'Подрезка кромок и дорожек', done: false },
]

const PREVIEW_PHOTOS = [
  { src: '/images/lawn-before.png', alt: 'Участок до работы' },
  { src: '/images/lawn-after.png', alt: 'Участок после работы' },
]

function FloatingCard({
  className,
  icon,
  title,
  value,
}: {
  className?: string
  icon: React.ReactNode
  title: string
  value: string
}) {
  return (
    <div
      className={cn(
        'absolute z-10 hidden items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-lg shadow-foreground/5 lg:flex',
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        {icon}
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] text-muted-foreground">{title}</span>
        <span className="block text-sm font-semibold text-foreground">{value}</span>
      </span>
    </div>
  )
}

export function TrackerMockup({
  className,
  floating = false,
}: {
  className?: string
  floating?: boolean
}) {
  return (
    <div className={cn('relative', className)}>
      {floating && (
        <>
          <FloatingCard
            className="-left-10 top-6 -translate-x-1/2"
            icon={<UserRound className="size-4" />}
            title="Исполнитель назначен"
            value="Игорь С."
          />
          <FloatingCard
            className="-right-8 top-[23rem] translate-x-1/2"
            icon={<Camera className="size-4" />}
            title="Фотоотчёт"
            value="Фото загружены"
          />
        </>
      )}

      <div className="mx-auto w-full max-w-[360px] rounded-[2rem] border border-border bg-card p-2 shadow-xl shadow-foreground/5 lg:-mt-4">
        <div className="overflow-hidden rounded-[1.6rem] border border-border/60 bg-background">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Заказ DT-124
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" /> В работе
            </span>
          </div>

          <div className="space-y-3 px-4 py-4">
            <div>
              <p className="font-display text-base font-semibold text-foreground">Уход за участком</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserRound className="size-3.5" /> Исполнитель: Игорь С.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              {TIMELINE_STEPS.map((step, i) => (
                <div key={step} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full text-[10px] font-semibold',
                      i < ACTIVE_STEP
                        ? 'bg-primary text-primary-foreground'
                        : i === ACTIVE_STEP
                          ? 'border-2 border-primary bg-background text-primary'
                          : 'border border-border bg-background text-transparent',
                    )}
                  >
                    {i < ACTIVE_STEP ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] leading-tight',
                      i <= ACTIVE_STEP ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border p-3.5">
              <p className="text-sm font-medium text-foreground">Список работ</p>
              <ul className="mt-2 space-y-1.5">
                {CHECKLIST_ITEMS.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-xs">
                    <span
                      className={
                        item.done
                          ? 'flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground'
                          : 'size-4 shrink-0 rounded-full border border-border'
                      }
                    >
                      {item.done && <Check className="size-3" />}
                    </span>
                    <span className={item.done ? 'truncate text-muted-foreground line-through' : 'truncate text-foreground'}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Camera className="size-3.5" /> Фото до / после
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PREVIEW_PHOTOS.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.src}
                    src={photo.src}
                    alt={photo.alt}
                    className="aspect-[4/3] w-full rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
