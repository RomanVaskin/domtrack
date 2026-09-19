import { notFound } from 'next/navigation'
import { ConfirmedOrderCard } from '@/components/tracker/confirmed-order-card'
import { ClientAutoRefresh } from '@/components/tracker/client-auto-refresh'
import { OrderPhotoGallery } from '@/components/tracker/order-photo-gallery'
import { getOrderByClientToken } from '@/lib/orders'
import { showClientPhotoReport } from '@/lib/order-presentation'

export default async function ClientOrderPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const order = await getOrderByClientToken(token)
  if (!order) notFound()
  return (
    <>
      <ClientAutoRefresh enabled={order.status !== 'completed'} />
      <ConfirmedOrderCard order={order}>
        {showClientPhotoReport(order.photoReportEnabled) && <OrderPhotoGallery photos={order.photos} />}
      </ConfirmedOrderCard>
    </>
  )
}
