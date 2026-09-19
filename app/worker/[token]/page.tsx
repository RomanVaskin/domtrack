import { notFound } from 'next/navigation'
import { ConfirmedOrderCard } from '@/components/tracker/confirmed-order-card'
import { WorkerAction } from '@/components/tracker/worker-action'
import { getOrderByWorkerToken } from '@/lib/orders'

export default async function WorkerOrderPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const order = await getOrderByWorkerToken(token)
  if (!order) notFound()
  return (
    <>
      <ConfirmedOrderCard order={order} worker />
      <WorkerAction token={token} status={order.status} />
    </>
  )
}
