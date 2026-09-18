const steps = [
  { n: '1', title: 'Вы выбираете услугу', desc: 'Категория, дата и детали — за пару минут.' },
  { n: '2', title: 'Мы назначаем исполнителя', desc: 'Проверенный специалист под вашу задачу.' },
  { n: '3', title: 'Вы следите за работой онлайн', desc: 'Статус, исполнитель и фото результата.' },
]

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 pt-24 md:px-8 md:pt-32">
      <div className="rounded-3xl border border-border bg-card p-8 md:p-12">
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Как работает DomTrack
        </h2>

        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((s) => (
            <li key={s.n} className="relative">
              <span className="font-display text-sm font-semibold text-primary">
                0{s.n}
              </span>
              <div className="mt-3 h-px w-full bg-border" />
              <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.desc}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-sm text-muted-foreground">
          Без обязательной регистрации и установки приложения.
        </p>
      </div>
    </section>
  )
}
