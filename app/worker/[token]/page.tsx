import { notFound } from 'next/navigation'
import { ConfirmedOrderCard } from '@/components/tracker/confirmed-order-card'
import { WorkerAction } from '@/components/tracker/worker-action'
import { WorkerPhotos } from '@/components/tracker/worker-photos'
import { getOrderByWorkerToken } from '@/lib/orders'
import { showWorkerPhotoReport } from '@/lib/order-presentation'

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
      <ConfirmedOrderCard order={order} worker>
        {showWorkerPhotoReport(order.photoReportEnabled, order.status) && (
          <WorkerPhotos token={token} status={order.status} initialPhotos={order.photos} />
        )}
      </ConfirmedOrderCard>
      <WorkerAction token={token} status={order.status} />
    </>
  )
}
