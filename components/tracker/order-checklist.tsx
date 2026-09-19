'use client'

import { Check, Circle } from 'lucide-react'
import { useState } from 'react'
import { setChecklistItemCompleted } from '@/app/worker/actions'
import type { OrderChecklistItem, TrackableOrderStatus } from '@/lib/public-orders'
import { cn } from '@/lib/utils'

export function WorkerChecklist({
  token,
  status,
  initialItems,
}: {
  token: string
  status: TrackableOrderStatus
  initialItems: OrderChecklistItem[]
}) {
  const [items, setItems] = useState(initialItems)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState(false)
  const editable = status === 'in_progress'

  async function toggle(item: OrderChecklistItem) {
    if (!editable || pendingIds.has(item.id)) return
    const completed = !item.completed
    setError(false)
    setPendingIds((current) => new Set(current).add(item.id))
    setItems((current) => current.map((entry) => (
      entry.id === item.id ? { ...entry, completed } : entry
    )))

    const result = await setChecklistItemCompleted(token, item.id, completed)
    setPendingIds((current) => {
      const next = new Set(current)
      next.delete(item.id)
      return next
    })
    if (!result.ok) {
      setItems((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, completed: item.completed } : entry
      )))
      setError(true)
      return
    }
    setItems((current) => current.map((entry) => (
      entry.id === item.id
        ? { ...entry, completed: result.completed, completedAt: result.completedAt }
        : entry
    )))
  }

  return (
    <ChecklistCard
      title="Чек-лист уборки"
      items={items}
      editable={editable}
      pendingIds={pendingIds}
      onToggle={toggle}
      error={error}
    />
  )
}

export function ClientChecklist({ items }: { items: OrderChecklistItem[] }) {
  return <ChecklistCard title="Ход уборки" items={items} />
}

function ChecklistCard({
  title,
  items,
  editable = false,
  pendingIds = new Set<string>(),
  onToggle,
  error = false,
}: {
  title: string
  items: OrderChecklistItem[]
  editable?: boolean
  pendingIds?: Set<string>
  onToggle?: (item: OrderChecklistItem) => void
  error?: boolean
}) {
  const done = items.filter((item) => item.completed).length
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {done} из {items.length} выполнено
        </p>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
        />
      </div>
      <ul className="mt-4 overflow-hidden rounded-xl border border-border">
        {items.map((item, index) => (
          <li key={item.id} className={cn(index > 0 && 'border-t border-border')}>
            {editable ? (
              <button
                type="button"
                onClick={() => onToggle?.(item)}
                disabled={pendingIds.has(item.id)}
                aria-pressed={item.completed}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
              >
                <ChecklistMark completed={item.completed} />
                <span className={cn(
                  'text-[15px] leading-snug',
                  item.completed && 'text-muted-foreground line-through',
                )}>
                  {item.title}
                </span>
              </button>
            ) : (
              <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                <ChecklistMark completed={item.completed} />
                <span className={cn(
                  'text-[15px] leading-snug',
                  !item.completed && 'text-muted-foreground',
                )}>
                  {item.title}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!editable && (
        <p className="mt-3 text-xs text-muted-foreground">Чек-лист доступен только для просмотра.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Не удалось сохранить пункт. Состояние обновлено обратно.
        </p>
      )}
    </section>
  )
}

function ChecklistMark({ completed }: { completed: boolean }) {
  return completed ? (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Check className="size-5" />
    </span>
  ) : (
    <Circle className="size-7 shrink-0 text-border" strokeWidth={2} />
  )
}
