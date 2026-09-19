import { notFound } from 'next/navigation'
import { ConfirmedOrderCard } from '@/components/tracker/confirmed-order-card'
import { ClientAutoRefresh } from '@/components/tracker/client-auto-refresh'
import { getOrderByClientToken } from '@/lib/orders'

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
      <ConfirmedOrderCard order={order} />
    </>
  )
}
