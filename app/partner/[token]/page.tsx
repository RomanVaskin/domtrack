import { notFound } from 'next/navigation'
import { getReferralPartnerByAccessToken } from '@/lib/referral-partners'
import { formatRubles } from '@/lib/pricing'

function orderPriceAndCommission(order: {
  totalPrice: number | null
  commissionState: 'accrued' | 'pending' | 'price_unconfirmed'
  commission: number
}): string {
  if (order.commissionState === 'accrued') {
    return `✅ Выполнен · Начислено: ${formatRubles(order.commission)}`
  }
  if (order.commissionState === 'price_unconfirmed') {
    return 'Выполнен · цена ещё не подтверждена'
  }
  return 'Ожидает выполнения'
}

// Partner self-service stats, reached only via the long random access token. Never renders
// client name, phone, address or Telegram username — only order number, date, amount and status.
export default async function PartnerStatsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const partner = await getReferralPartnerByAccessToken(token)
  if (!partner) notFound()

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold text-foreground">{partner.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Статистика партнёра DomTrack · комиссия {partner.commissionPercent}%
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Заказов" value={String(partner.ordersCount)} />
        <Stat label="Сумма заказов" value={formatRubles(partner.totalAmount)} />
        <Stat label="Выполнено" value={formatRubles(partner.completedAmount)} />
        <Stat label="Комиссия" value={formatRubles(partner.accruedCommission)} />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-foreground">Заказы</h2>
      {partner.orders.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Пока нет заказов.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {partner.orders.map((order) => (
            <li key={order.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">{order.number}</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">
                  {order.totalPrice === null ? 'Цена не подтверждена' : formatRubles(order.totalPrice)}
                </span>
                <span className="text-muted-foreground">{order.statusLabel}</span>
              </div>
              <div className="mt-2 text-sm">
                {order.commissionState === 'pending' ? (
                  <span className="text-muted-foreground">{orderPriceAndCommission(order)}</span>
                ) : (
                  <span className="font-medium text-foreground">{orderPriceAndCommission(order)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}
