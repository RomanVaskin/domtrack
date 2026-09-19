'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeWork, markOnTheWay, startWork } from '@/app/worker/actions'
import { Button } from '@/components/ui/button'
import { getWorkerActionPresentation } from '@/lib/order-presentation'
import type { TrackableOrderStatus } from '@/lib/public-orders'

const actions = { leave: markOnTheWay, start: startWork, complete: completeWork }

export function WorkerAction({ token, status }: { token: string; status: TrackableOrderStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const presentation = getWorkerActionPresentation(status)
  if (!presentation) return null
  const { action, label, pending } = presentation

  function submit() {
    setError(false)
    startTransition(async () => {
      const result = await actions[action](token)
      if (!result.ok) setError(true)
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md">
      <div className="border-t border-border bg-background/95 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-5">
        {error && (
          <p role="alert" className="mb-2 text-center text-xs text-destructive">
            Статус уже изменился или действие недоступно. Страница обновлена.
          </p>
        )}
        <Button
          type="button"
          size="lg"
          disabled={isPending}
          onClick={submit}
          className="h-14 w-full rounded-2xl text-base"
        >
          {isPending ? pending : label}
        </Button>
      </div>
    </div>
  )
}
