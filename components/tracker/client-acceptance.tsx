'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptWork } from '@/app/o/actions'
import { Button } from '@/components/ui/button'
import { CLIENT_ACCEPT_ACTION_LABEL } from '@/lib/order-presentation'

export function ClientAcceptance({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  function submit() {
    setError(false)
    startTransition(async () => {
      const result = await acceptWork(token)
      if (!result.ok) setError(true)
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md">
      <div className="border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-5">
        {error && (
          <p role="alert" className="mb-2 text-center text-xs text-destructive">
            Не удалось принять работу. Обновите страницу и попробуйте снова.
          </p>
        )}
        <Button
          type="button"
          size="lg"
          disabled={isPending}
          onClick={submit}
          className="h-14 w-full rounded-2xl text-base"
        >
          {isPending ? 'Принимаем…' : CLIENT_ACCEPT_ACTION_LABEL}
        </Button>
      </div>
    </div>
  )
}
