import { Check } from 'lucide-react'

type StepState = 'done' | 'current' | 'todo'

const steps: { label: string; state: StepState; time?: string }[] = [
  { label: 'Заказ принят', state: 'done', time: '11:32' },
  { label: 'Исполнитель назначен', state: 'done', time: '11:40' },
  { label: 'В пути', state: 'done', time: '11:58' },
  { label: 'Работа начата', state: 'current', time: '12:06' },
  { label: 'Работа завершена', state: 'todo' },
  { label: 'Принять работу', state: 'todo' },
]

export function OrderTimeline() {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        return (
          <li key={step.label} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <span
                aria-hidden="true"
                className={`absolute left-[13px] top-7 h-[calc(100%-1rem)] w-px ${
                  step.state === 'done' ? 'bg-primary/40' : 'bg-border'
                }`}
              />
            )}

            <span
              aria-hidden="true"
              className={`relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                step.state === 'done'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : step.state === 'current'
                    ? 'border-primary bg-background text-primary'
                    : 'border-border bg-background text-transparent'
              }`}
            >
              {step.state === 'done' ? (
                <Check className="size-4" strokeWidth={3} />
              ) : step.state === 'current' ? (
                <span className="size-2.5 rounded-full bg-primary" />
              ) : (
                <span className="size-2 rounded-full bg-border" />
              )}
            </span>

            <div
              className={`flex-1 rounded-xl px-3 py-2 transition-colors ${
                step.state === 'current' ? 'bg-accent' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-display text-sm ${
                    step.state === 'todo'
                      ? 'font-medium text-muted-foreground'
                      : 'font-semibold text-foreground'
                  }`}
                >
                  {step.label}
                </span>
                {step.time && (
                  <span className="text-xs text-muted-foreground">{step.time}</span>
                )}
              </div>
              {step.state === 'current' && (
                <p className="mt-0.5 text-xs font-medium text-primary">
                  Сейчас · исполнитель на участке
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
