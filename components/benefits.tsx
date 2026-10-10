import { Camera, ClipboardList, Eye, Layers, Link2 } from 'lucide-react'

const BENEFITS = [
  { icon: Layers, text: 'Один сервис вместо поиска разных исполнителей под каждую задачу' },
  { icon: Eye, text: 'Прозрачный статус заказа — от подтверждения до завершения' },
  { icon: Camera, text: 'Фото результата после выполнения работы' },
  { icon: ClipboardList, text: 'Чек-лист работ с фото по пунктам для уборки дома' },
  { icon: Link2, text: 'Доступ по персональной ссылке — без регистрации и приложения' },
]

export function Benefits() {
  return (
    <section id="benefits" className="scroll-mt-20 mx-auto max-w-6xl px-4 pt-20 sm:px-5 sm:pt-24 md:px-8 md:pt-32">
      <div className="max-w-xl">
        <h2 className="text-balance font-display text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">
          Возможности DomTrack
        </h2>
      </div>

      <div className="mt-7 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </span>
            <p className="pt-1.5 text-sm font-medium leading-relaxed text-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
