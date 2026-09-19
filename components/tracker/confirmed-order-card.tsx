import Link from 'next/link'
import { CalendarDays, Clock, MapPin, Phone } from 'lucide-react'
import { Logo } from '@/components/logo'
import { formatRequestedDate } from '@/lib/format-requested-date'
import type { PublicOrder } from '@/lib/orders'
import { formatServiceParameters, SERVICE_LABELS } from '@/lib/telegram/flow'

export function ConfirmedOrderCard({
  order,
  worker = false,
}: {
  order: PublicOrder
  worker?: boolean
}) {
  const parameters = formatServiceParameters(order.serviceType, order.parameters)
  return (
    <main className="min-h-screen pb-10 sm:pb-16">
      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4 sm:h-16 sm:px-5">
          <Link href="/" aria-label="DomTrack — на главную" className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Заказ {order.number}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-3 px-4 pt-4 sm:space-y-4 sm:px-5 sm:pt-5">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Заказ {order.number}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">
            {SERVICE_LABELS[order.serviceType]}
          </h1>
          <div className="mt-5 space-y-3 text-sm text-muted-foreground">
            <Detail icon={<CalendarDays className="size-4" />} text={formatRequestedDate(order.requestedDate)} />
            <Detail icon={<Clock className="size-4" />} text={order.requestedTime} />
            <Detail icon={<MapPin className="size-4" />} text={order.address} />
            {worker && order.clientPhone && (
              <Detail icon={<Phone className="size-4" />} text={order.clientPhone} />
            )}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">Стоимость</span>
            <span className="text-sm font-semibold text-foreground">после подтверждения</span>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Параметры услуги</h2>
          <dl className="mt-4 space-y-2.5">
            {parameters.map((line) => {
              const [label, ...value] = line.split(': ')
              return (
                <div key={line} className="flex items-start justify-between gap-4 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value.join(': ')}</dd>
                </div>
              )
            })}
            <div className="flex items-start justify-between gap-4 border-t border-border pt-3 text-sm">
              <dt className="text-muted-foreground">Фотоотчёт</dt>
              <dd className="text-right font-medium text-foreground">{order.photoReportEnabled ? 'Нужен' : 'Не нужен'}</dd>
            </div>
          </dl>
        </section>

        {worker && order.comment && (
          <section className="rounded-2xl border border-border bg-secondary/60 p-5 sm:p-6">
            <h2 className="font-display text-base font-semibold text-foreground">Комментарий</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{order.comment}</p>
          </section>
        )}

        <section className="rounded-2xl border border-primary/20 bg-accent p-5 text-center sm:p-6">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent-foreground">
            <span className="size-2 rounded-full bg-primary" />
            {worker ? 'Статус: заказ подтверждён' : 'Заказ подтверждён'}
          </span>
        </section>
      </div>
    </main>
  )
}

function Detail({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-start gap-3">{icon}<span className="text-foreground">{text}</span></div>
}
