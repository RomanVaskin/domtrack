import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { OrderTimeline } from '@/components/tracker/order-timeline'
import { WorkPhotos } from '@/components/tracker/work-photos'
import { Check, Calendar, User, RotateCcw, MessageCircle } from 'lucide-react'

const included = ['Стрижка газона', 'Сбор травы', 'Уборка дорожек']

export default function OrderTrackerPage() {
  return (
    <main className="min-h-screen pb-16">
      {/* Top bar */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-md items-center justify-between px-5">
          <Link href="/" aria-label="DomTrack — на главную">
            <Logo />
          </Link>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Заказ #DT-124
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pt-5">
        {/* Order summary card */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Стрижка газона
          </h1>

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="size-4 shrink-0" />
              <span>19 сентября, 12:00</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <User className="size-4 shrink-0" />
                <span>
                  Исполнитель:{' '}
                  <span className="font-medium text-foreground">Алексей</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                Назначен
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Стоимость</span>
            <span className="font-display text-2xl font-semibold text-foreground">
              6 500 ₽
            </span>
          </div>
        </section>

        {/* Status timeline — main focus */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-5 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Статус заказа
          </h2>
          <OrderTimeline />
        </section>

        {/* What's included */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-base font-semibold text-foreground">
            Что входит
          </h2>
          <ul className="mt-4 space-y-2.5">
            {included.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent text-primary">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Comment */}
        <section className="rounded-2xl border border-border bg-secondary/60 p-6">
          <h2 className="font-display text-base font-semibold text-foreground">
            Комментарий
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Калитка со стороны парковки. Газон за домом тоже включён.
          </p>
        </section>

        {/* Work photos */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 font-display text-base font-semibold text-foreground">
            Фото работы
          </h2>
          <WorkPhotos />
        </section>

        {/* Actions */}
        <div className="space-y-3 pt-1">
          <Button size="lg" className="w-full rounded-full text-base">
            Принять работу
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full rounded-full border-border bg-transparent text-base"
          >
            <RotateCcw className="mr-1 size-4" />
            Повторить заказ
          </Button>
        </div>

        <div className="pt-4 text-center">
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <MessageCircle className="size-4" />
            Есть вопрос? Написать в DomTrack
          </a>
        </div>
      </div>
    </main>
  )
}
