import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-7 sm:px-5 sm:pt-10 md:px-8 md:pt-16">
      <div className="grid items-center gap-8 md:grid-cols-[1.05fr_1fr] md:gap-12">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Сервис обслуживания загородного дома
          </span>

          <h1 className="mt-5 text-balance font-display text-[2.25rem] font-semibold leading-[1.08] tracking-tight text-foreground sm:mt-6 sm:text-5xl md:text-6xl">
            Все заботы о доме — в одном месте
          </h1>

          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:mt-5 md:text-lg">
            Уборка, участок, сезонные работы и бытовые задачи. Закажите услугу и
            следите за выполнением по персональной ссылке.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
            <Button render={<a href="#services" />} nativeButton={false} size="lg" className="w-full rounded-full px-7 sm:w-auto">
              Выбрать услугу
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

        <div className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border shadow-[0_30px_60px_-30px_rgba(60,50,35,0.4)] sm:aspect-[5/4] md:aspect-[4/5]">
            <Image
              src="/images/hero-house.png"
              alt="Современный загородный дом с террасой и ухоженным участком на закате"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-3 left-3 right-3 rounded-2xl border border-border bg-background/90 p-3.5 shadow-sm backdrop-blur-md sm:-bottom-4 sm:left-6 sm:right-auto sm:w-64 sm:p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Заказ #DT-124
            </p>
            <p className="mt-1 font-display text-sm font-semibold text-foreground">
              Стрижка газона · в работе
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/5 rounded-full bg-primary" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
