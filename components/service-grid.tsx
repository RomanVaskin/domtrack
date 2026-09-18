import { House, Trees, Snowflake, Wrench, Truck, KeyRound, ArrowRight } from 'lucide-react'

const services = [
  { icon: House, title: 'Дом', desc: 'Уборка, окна, химчистка' },
  { icon: Trees, title: 'Участок', desc: 'Газон, листья, дорожки' },
  { icon: Snowflake, title: 'Сезонные работы', desc: 'Снег, подготовка участка, бассейн' },
  { icon: Wrench, title: 'Мастер', desc: 'Мелкие работы по дому' },
  { icon: Truck, title: 'Доставка', desc: 'Вода, газ, дрова' },
]

export function ServiceGrid() {
  return (
    <section id="services" className="mx-auto max-w-6xl px-5 pt-24 md:px-8 md:pt-32">
      <div className="max-w-xl">
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Что нужно сделать?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Выберите категорию — остальное мы возьмём на себя.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map(({ icon: Icon, title, desc }) => (
          <button
            key={title}
            type="button"
            className="group flex flex-col items-start rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-[0_20px_40px_-28px_rgba(60,50,35,0.5)]"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
              {title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </button>
        ))}

        {/* Featured signature service */}
        <button
          type="button"
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-primary p-6 text-left text-primary-foreground transition-all hover:shadow-[0_28px_50px_-24px_rgba(40,60,45,0.7)] sm:col-span-2 lg:col-span-1"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-primary-foreground/10 blur-xl"
          />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide">
              Услуга DomTrack
            </span>
            <span className="mt-5 flex size-11 items-center justify-center rounded-xl bg-primary-foreground/15">
              <KeyRound className="size-5" />
            </span>
            <h3 className="mt-5 font-display text-xl font-semibold leading-snug">
              Подготовить дом к&nbsp;приезду
            </h3>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Комплексная подготовка дома и участка к вашему приезду.
            </p>
          </div>
          <span className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-medium">
            Заказать под ключ
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </section>
  )
}
