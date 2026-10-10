import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-5 sm:pt-24 md:px-8 md:pt-32">
      <div className="rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12 sm:py-16">
        <h2 className="mx-auto max-w-xl text-balance font-display text-[1.75rem] font-semibold tracking-tight sm:text-3xl md:text-4xl">
          Дом требует внимания. DomTrack берёт организацию на себя.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-pretty leading-relaxed text-primary-foreground/85">
          Закажите услугу через Telegram-бот — мы подтвердим заявку и пришлём персональную
          ссылку для отслеживания хода работы.
        </p>
        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Button
            render={<a href="#services" />}
            nativeButton={false}
            size="lg"
            className="w-full rounded-full bg-primary-foreground px-7 text-primary hover:bg-primary-foreground/90 sm:w-auto"
          >
            Заказать услугу
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
