import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { TrackerMockup } from '@/components/home/tracker-mockup'

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-7 sm:px-5 sm:pt-10 md:px-8 md:pt-16">
      <div className="grid items-center gap-12 md:grid-cols-[1.05fr_1fr] md:gap-12 lg:gap-20">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/75">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Сервис обслуживания загородного дома
          </span>

          <h1 className="mt-5 text-balance font-display text-[2.25rem] font-semibold leading-[1.08] tracking-tight text-foreground sm:mt-6 sm:text-5xl md:text-6xl">
            Все заботы о загородном доме — в одном месте
          </h1>

          <p className="mt-4 text-pretty text-base leading-relaxed text-foreground/70 sm:mt-5 md:text-lg">
            Закажите уборку, уход за участком, мелкий ремонт или доставку. DomTrack организует
            работу, а вы видите статус и результат в одном трекере.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
            <Button render={<a href="#services" />} nativeButton={false} size="lg" className="w-full rounded-full px-7 sm:w-auto">
              Заказать услугу
              <ArrowRight className="ml-1 size-4" />
            </Button>
            <Button
              render={<a href="#how" />}
              nativeButton={false}
              size="lg"
              variant="outline"
              className="w-full rounded-full border-border bg-transparent px-7 sm:w-auto"
            >
              Как это работает
            </Button>
          </div>
        </div>

        <TrackerMockup floating className="lg:justify-self-end" />
      </div>
    </section>
  )
}
