import { ArrowRight, Droplets, Flame, House, Trees } from 'lucide-react'
import { Button } from '@/components/ui/button'

const TASKS = [
  { icon: House, label: 'Уборка дома' },
  { icon: Trees, label: 'Подготовка участка' },
  { icon: House, label: 'Окна и мелкие работы' },
  { icon: Droplets, label: 'Доставка воды' },
  { icon: Flame, label: 'Доставка дров' },
]

export function KeyScenario() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-5 sm:pt-24 md:px-8 md:pt-32">
      <div className="overflow-hidden rounded-3xl bg-primary px-5 py-10 text-primary-foreground sm:px-8 sm:py-14 md:px-12 md:py-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
            Частый сценарий
          </span>
          <h2 className="mt-5 text-balance font-display text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl md:text-4xl">
            Подготовить дом к приезду
          </h2>
          <p className="mt-4 max-w-xl text-pretty leading-relaxed text-primary-foreground/85">
            Перед выездом на выходные или приезд гостей часто нужно сразу несколько задач: убрать
            дом, привести в порядок участок, помыть окна и подвезти воду или дрова. С DomTrack всё
            это можно заказать в одном месте, а не искать исполнителя под каждую задачу отдельно.
          </p>

          <ul className="mt-7 flex flex-wrap gap-2.5">
            {TASKS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3.5 py-2 text-sm font-medium"
              >
                <Icon className="size-4" />
                {label}
              </li>
            ))}
          </ul>

          <Button
            render={<a href="#services" />}
            nativeButton={false}
            size="lg"
            className="mt-8 rounded-full bg-primary-foreground px-7 text-primary hover:bg-primary-foreground/90"
          >
            Заказать услугу
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
