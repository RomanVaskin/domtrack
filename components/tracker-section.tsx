import { Camera, ClipboardList, Eye, Link2, UserRound } from 'lucide-react'
import { TrackerMockup } from '@/components/home/tracker-mockup'

const POINTS = [
  { icon: Eye, text: 'Статус заказа в реальном времени' },
  { icon: UserRound, text: 'Исполнитель, который назначен на заказ' },
  { icon: ClipboardList, text: 'Список работ и что уже выполнено' },
  { icon: Camera, text: 'Фото до и после выполнения' },
]

export function TrackerSection() {
  return (
    <section id="tracker" className="scroll-mt-20 mx-auto max-w-6xl px-4 pt-20 sm:px-5 sm:pt-24 md:px-8 md:pt-32">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="order-2 lg:order-1">
          <TrackerMockup />
        </div>
        <div className="order-1 max-w-md lg:order-2">
          <h2 className="text-balance font-display text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">
            Не нужно звонить и спрашивать, что происходит
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-foreground/70">
            После подтверждения заказа вы получаете персональную ссылку DomTrack. Там видно, кто
            выполняет работу, что уже сделано и как всё выглядит на фото — без звонков и
            переписки.
          </p>
          <ul className="mt-6 space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm font-medium text-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-center gap-1.5 text-sm text-foreground/70">
            <Link2 className="size-4" /> Ссылка приходит в Telegram после подтверждения заказа
          </p>
        </div>
      </div>
    </section>
  )
}
