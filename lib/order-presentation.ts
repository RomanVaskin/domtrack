import type { TrackableOrderStatus } from './public-orders.ts'
import type { WorkerAction } from './worker-orders.ts'

export type TimelineStepState = 'done' | 'current' | 'final' | 'todo'

export const CLIENT_ACCEPT_ACTION_LABEL = 'Принять работу'
export const CLIENT_ACCEPTED_TITLE = 'Работа принята'
export const CLIENT_ACCEPTED_MESSAGE = 'Спасибо! Работа завершена и принята.'

export function showClientPhotoReport(photoReportEnabled: boolean): boolean {
  return photoReportEnabled
}

export function showClientAcceptance(status: TrackableOrderStatus): boolean {
  return status === 'completed'
}

export function showWorkerPhotoReport(
  photoReportEnabled: boolean,
  status: TrackableOrderStatus,
): boolean {
  return photoReportEnabled && (
    status === 'in_progress' || status === 'completed' || status === 'accepted'
  )
}

const timelineSteps = [
  { status: 'confirmed', label: 'Заказ подтверждён' },
  { status: 'assigned', label: 'Исполнитель назначен' },
  { status: 'on_the_way', label: 'В пути' },
  { status: 'in_progress', label: 'Работа начата' },
  { status: 'completed', label: 'Работа завершена' },
  { status: 'accepted', label: 'Работа принята' },
] as const

export function getOrderTimeline(status: TrackableOrderStatus) {
  const activeIndex = timelineSteps.findIndex((step) => step.status === status)
  return timelineSteps.map((step, index) => ({
    ...step,
    state: (
      index < activeIndex
        ? 'done'
        : index === activeIndex
          ? status === 'accepted' ? 'final' : 'current'
          : 'todo'
    ) as TimelineStepState,
  }))
}

export function getWorkerStatusLabel(status: TrackableOrderStatus): string {
  return {
    confirmed: 'Ожидает назначения',
    assigned: 'Исполнитель назначен',
    on_the_way: 'Исполнитель в пути',
    in_progress: 'Работа начата',
    completed: 'Работа завершена',
    accepted: 'Работа принята клиентом',
  }[status]
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
