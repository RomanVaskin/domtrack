import { Camera, ClipboardList, Eye, Layers, Link2 } from 'lucide-react'

const BENEFITS = [
  {
    icon: Layers,
    title: 'Один сервис',
    text: 'Вместо поиска разных исполнителей под каждую задачу',
  },
  {
    icon: Eye,
    title: 'Прозрачный статус',
    text: 'Видно, на каком этапе работа — от подтверждения до завершения',
  },
  {
    icon: Camera,
    title: 'Фото результата',
    text: 'Фото после выполнения работы в персональном трекере',
  },
  {
    icon: ClipboardList,
    title: 'Чек-лист работ',
    text: 'С фото по каждому пункту — для уборки дома',
  },
  {
    icon: Link2,
    title: 'Без регистрации',
    text: 'Доступ по персональной ссылке, без приложения',
  },
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
        {BENEFITS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-border bg-card p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </span>
            <h3 className="mt-4 font-display text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">{text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
