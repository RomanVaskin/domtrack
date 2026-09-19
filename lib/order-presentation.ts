import type { TrackableOrderStatus } from './public-orders.ts'
import type { WorkerAction } from './worker-orders.ts'

export type TimelineStepState = 'done' | 'current' | 'final' | 'todo'

const timelineSteps = [
  { status: 'confirmed', label: 'Заказ подтверждён' },
  { status: 'assigned', label: 'Исполнитель назначен' },
  { status: 'on_the_way', label: 'В пути' },
  { status: 'in_progress', label: 'Работа начата' },
  { status: 'completed', label: 'Работа завершена' },
] as const

export function getOrderTimeline(status: TrackableOrderStatus) {
  const activeIndex = timelineSteps.findIndex((step) => step.status === status)
  return timelineSteps.map((step, index) => ({
    ...step,
    state: (
      index < activeIndex
        ? 'done'
        : index === activeIndex
          ? status === 'completed' ? 'final' : 'current'
          : 'todo'
    ) as TimelineStepState,
  }))
}

export function getWorkerActionPresentation(status: TrackableOrderStatus): {
  action: WorkerAction
  label: string
  pending: string
} | null {
  switch (status) {
    case 'assigned':
      return { action: 'leave', label: 'Выехал', pending: 'Сохраняем…' }
    case 'on_the_way':
      return { action: 'start', label: 'Начать работу', pending: 'Начинаем…' }
    case 'in_progress':
      return { action: 'complete', label: 'Завершить работу', pending: 'Завершаем…' }
    default:
      return null
  }
}
