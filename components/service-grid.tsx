import { House, Leaf, Snowflake, Sparkles, Trees, Waves, Wrench } from 'lucide-react'

const services = [
  { icon: House, title: 'Уборка дома', desc: 'Поддерживающая, генеральная и уборка после ремонта' },
  { icon: Trees, title: 'Стрижка газона', desc: 'Покос, сбор и вывоз травы' },
  { icon: Snowflake, title: 'Уборка снега', desc: 'Парковка, въезд, дорожки и территория' },
  { icon: Leaf, title: 'Уборка листьев', desc: 'Сбор листьев в мешки и вывоз' },
  { icon: Sparkles, title: 'Окна и фасад', desc: 'Мойка окон, остекления и фасада' },
  { icon: Wrench, title: 'Мастер по дому', desc: 'Мелкий ремонт и бытовые работы' },
  { icon: Waves, title: 'Бассейн', desc: 'Разовое и регулярное обслуживание' },
]

export function ServiceGrid() {
  return (
    <section id="services" className="scroll-mt-20 mx-auto max-w-6xl px-4 pt-20 sm:px-5 sm:pt-24 md:px-8 md:pt-32">
      <div className="max-w-xl">
        <h2 className="text-balance font-display text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">
          Что нужно сделать?
        </h2>
        <p className="mt-3 text-foreground/70">
          Один сервис закрывает регулярные задачи владельца дома — не нужно искать отдельного
          исполнителя под каждую.
        </p>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-4">
        {services.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="group flex min-h-40 flex-col items-start rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-[0_20px_40px_-28px_rgba(60,50,35,0.5)] sm:min-h-0 sm:p-6"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-base font-semibold leading-tight text-foreground sm:mt-5 sm:text-lg">
              {title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-foreground/70 sm:text-sm">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
