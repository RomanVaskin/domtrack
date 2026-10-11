import Link from 'next/link'
import { Link2, Share2, Users, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TELEGRAM_PARTNER_START_URL } from '@/lib/telegram-contact'

const PARTNER_STEPS = [
  { icon: Link2, title: 'Получаете персональные ссылки' },
  { icon: Share2, title: 'Делитесь ими' },
  { icon: Percent, title: 'Получаете 10%' },
]

export function ReferralTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-5 sm:pt-24 md:px-8 md:pt-32">
      <div className="rounded-3xl border border-border bg-card p-6 sm:p-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground/75">
          <Users className="size-3.5 text-primary" /> Партнёрская программа
        </span>
        <h2 className="mt-5 text-balance font-display text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl">
          Зарабатывайте вместе с DomTrack
        </h2>
        <p className="mt-3 max-w-xl text-pretty leading-relaxed text-foreground/70">
          Рекомендуйте DomTrack владельцам загородных домов, жителям посёлка, клиентам или
          знакомым и получайте 10% с каждого выполненного заказа.
        </p>

        <ol className="mt-7 grid gap-4 sm:grid-cols-3">
          {PARTNER_STEPS.map(({ icon: Icon, title }, i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </span>
              <span className="pt-1 text-sm font-medium leading-snug text-foreground">
                {i + 1}. {title}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-sm text-foreground/70">
          Все заказы, статусы, суммы и начисления видны по персональной ссылке.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button
            render={<Link href="/partners" />}
            nativeButton={false}
            size="lg"
            className="w-full rounded-full px-7 sm:w-auto"
          >
            Подробнее о партнёрской программе
          </Button>
          <Button
            render={<a href={TELEGRAM_PARTNER_START_URL} target="_blank" rel="noreferrer" />}
            nativeButton={false}
            size="lg"
            variant="outline"
            className="w-full rounded-full border-border bg-transparent px-7 sm:w-auto"
          >
            Стать партнёром
          </Button>
        </div>
      </div>
    </section>
  )
}
