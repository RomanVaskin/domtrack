import { notFound } from 'next/navigation'
import { ConfirmedOrderCard } from '@/components/tracker/confirmed-order-card'
import { ClientAutoRefresh } from '@/components/tracker/client-auto-refresh'
import { ClientAcceptance } from '@/components/tracker/client-acceptance'
import { OrderPhotoGallery } from '@/components/tracker/order-photo-gallery'
import { ClientChecklist } from '@/components/tracker/order-checklist'
import { getOrderByClientToken } from '@/lib/orders'
import { showClientAcceptance, showClientPhotoReport } from '@/lib/order-presentation'

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
      <ClientAutoRefresh enabled={order.status !== 'completed' && order.status !== 'accepted'} />
      <ConfirmedOrderCard order={order}>
        {order.serviceType !== 'house_cleaning' && showClientPhotoReport(order.photoReportEnabled) && (
          <OrderPhotoGallery photos={order.photos} />
        )}
        {order.serviceType === 'house_cleaning' && order.photos.length > 0 && (
          <OrderPhotoGallery photos={order.photos} />
        )}
        {order.serviceType === 'house_cleaning' && order.checklist.length > 0 && (
          <ClientChecklist items={order.checklist} />
        )}
      </ConfirmedOrderCard>
      {showClientAcceptance(order.status) && <ClientAcceptance token={token} />}
    </>
  )
}
