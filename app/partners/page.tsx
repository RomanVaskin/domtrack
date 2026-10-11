import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2,
  CheckCircle2,
  Hammer,
  Megaphone,
  PenTool,
  Percent,
  ShieldCheck,
  Share2,
  TreePine,
  Users,
  Waves,
} from 'lucide-react'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { formatRubles } from '@/lib/pricing'
import { TELEGRAM_PARTNER_START_URL } from '@/lib/telegram-contact'
import { getReferralCodeFromCookies, resolveTelegramOrderUrl } from '@/lib/referral-attribution'

export const metadata: Metadata = {
  title: 'Партнёрская программа DomTrack — 10% с выполненных заказов',
  description:
    'Рекомендуйте DomTrack владельцам загородных домов и получайте 10% с каждого выполненного заказа.',
}

const AUDIENCE = [
  { icon: Building2, text: 'Администраторам коттеджных посёлков' },
  { icon: Users, text: 'Председателям и управляющим КП' },
  { icon: Building2, text: 'Риелторам по загородной недвижимости' },
  { icon: Hammer, text: 'Строителям' },
  { icon: TreePine, text: 'Ландшафтным компаниям' },
  { icon: Waves, text: 'Компаниям по обслуживанию бассейнов' },
  { icon: PenTool, text: 'Дизайнерам' },
  { icon: Megaphone, text: 'Локальным блогерам' },
  { icon: Share2, text: 'Активным жителям КП' },
]

const HOW_IT_WORKS = [
  { title: 'Получаете персональные ссылки', text: 'Ссылка на Telegram для клиентов, ссылка на сайт и личная ссылка со статистикой.' },
  { title: 'Рекомендуете DomTrack', text: 'Клиент оформляет заказ по вашей ссылке — через сайт или сразу в Telegram.' },
  { title: 'Получаете 10%', text: 'Комиссия начисляется после выполнения заказа.' },
]

const VISIBLE_TO_PARTNER = ['Количество заказов', 'Статус каждого заказа', 'Сумму заказа', 'Выполнен заказ или нет', 'Размер начисленной комиссии']

function Shell({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`mx-auto max-w-6xl px-4 sm:px-5 md:px-8 ${className}`}>{children}</div>
}

export default async function PartnersPage() {
  const referralCode = await getReferralCodeFromCookies()
  const telegramUrl = resolveTelegramOrderUrl(referralCode)
  const orders = 10
  const avgPrice = 10_000
  const totalOrders = orders * avgPrice
  const commission = Math.round(totalOrders * 0.1)

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <Shell className="flex h-14 items-center justify-between md:h-16">
          <Link href="/" aria-label="DomTrack — на главную" className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
          <Button
            render={<a href={TELEGRAM_PARTNER_START_URL} target="_blank" rel="noreferrer" />}
            nativeButton={false}
            size="sm"
            className="rounded-full px-4 sm:px-5"
          >
            Стать партнёром
          </Button>
        </Shell>
      </header>

      <Shell className="max-w-3xl pt-10 sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/75">
          <Users className="size-3.5 text-primary" /> Партнёрская программа
        </span>
        <h1 className="mt-5 text-balance font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl">
          Партнёрская программа DomTrack
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-foreground/70 sm:text-lg">
          Получайте 10% с каждого выполненного заказа, который пришёл по вашей персональной ссылке.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            render={<a href={TELEGRAM_PARTNER_START_URL} target="_blank" rel="noreferrer" />}
            nativeButton={false}
            size="lg"
            className="w-full rounded-full px-7 sm:w-auto"
          >
            Стать партнёром
          </Button>
          <Button
            render={<a href={telegramUrl} target="_blank" rel="noreferrer" />}
            nativeButton={false}
            size="lg"
            variant="outline"
            className="w-full rounded-full border-border bg-transparent px-7 sm:w-auto"
          >
            Заказать услугу
          </Button>
        </div>
      </Shell>

      <section className="pt-16 sm:pt-20">
        <Shell>
          <h2 className="font-display text-[1.5rem] font-semibold tracking-tight text-foreground sm:text-2xl">Кому подходит</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCE.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-4" />
                </span>
                <p className="pt-1.5 text-sm font-medium leading-relaxed text-foreground">{text}</p>
              </div>
            ))}
          </div>
        </Shell>
      </section>

      <section className="pt-16 sm:pt-20">
        <Shell>
          <h2 className="font-display text-[1.5rem] font-semibold tracking-tight text-foreground sm:text-2xl">Как это работает</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map(({ title, text }, i) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="mt-3 font-medium text-foreground">{title}</p>
                <p className="mt-1 text-sm text-foreground/70">{text}</p>
              </div>
            ))}
          </div>
        </Shell>
      </section>

      <section className="pt-16 sm:pt-20">
        <Shell>
          <h2 className="font-display text-[1.5rem] font-semibold tracking-tight text-foreground sm:text-2xl">Что видно партнёру</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <ul className="grid gap-3 sm:grid-cols-2">
              {VISIBLE_TO_PARTNER.map((item) => (
                <li key={item} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-medium text-foreground">
                  <CheckCircle2 className="size-4 shrink-0 text-primary" /> {item}
                </li>
              ))}
            </ul>
            <div className="flex items-start gap-3 rounded-2xl border-2 border-primary bg-card p-5 lg:max-w-xs">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Персональные данные клиента партнёру не показываются.
              </p>
            </div>
          </div>
        </Shell>
      </section>

      <section className="pt-16 sm:pt-20">
        <Shell>
          <h2 className="font-display text-[1.5rem] font-semibold tracking-tight text-foreground sm:text-2xl">Пример</h2>
          <div className="mt-6 max-w-xl rounded-3xl border border-border bg-card p-6 sm:p-8">
            <p className="text-sm text-foreground/70">
              {orders} выполненных заказов × {formatRubles(avgPrice)}
            </p>
            <p className="mt-1 text-xl font-semibold text-foreground">= {formatRubles(totalOrders)} заказов</p>
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-sm text-foreground/70">10% партнёру</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-primary">= {formatRubles(commission)}</p>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm text-foreground/70">
            Это пример расчёта, не гарантия дохода — сумма зависит от количества и стоимости заказов ваших клиентов.
          </p>
        </Shell>
      </section>

      <section className="pt-16 pb-20 sm:pt-20 sm:pb-28">
        <Shell>
          <div className="rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12 sm:py-16">
            <Percent className="mx-auto size-8" />
            <h2 className="mx-auto mt-5 max-w-xl text-balance font-display text-[1.75rem] font-semibold tracking-tight sm:text-3xl">
              Готовы рекомендовать DomTrack?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-primary-foreground/85">
              Нажмите «Стать партнёром» — напишите нам в Telegram, и мы пришлём персональные ссылки.
            </p>
            <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
              <Button
                render={<a href={TELEGRAM_PARTNER_START_URL} target="_blank" rel="noreferrer" />}
                nativeButton={false}
                size="lg"
                className="w-full rounded-full bg-primary-foreground px-7 text-primary hover:bg-primary-foreground/90 sm:w-auto"
              >
                Стать партнёром
              </Button>
              <Link
                href="/"
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-primary-foreground/40 px-7 text-sm font-medium text-primary-foreground sm:w-auto"
              >
                На главную
              </Link>
            </div>
          </div>
        </Shell>
      </section>
    </main>
  )
}
