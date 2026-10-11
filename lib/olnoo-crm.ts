import type { CreatedOrder } from './telegram/types.ts'

type FetchLike = typeof fetch

export async function sendOrderToOlnooCrm(
  order: CreatedOrder,
  serviceLabel: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = process.env.OLNOO_CRM_URL?.trim()
  const apiKey = process.env.OLNOO_CRM_API_KEY?.trim()

  if (!url || !apiKey) {
    console.warn('[olnoo-crm] OLNOO_CRM_URL or OLNOO_CRM_API_KEY is not configured')
    return
  }

  const details = [
    `DomTrack order: ${order.number}`,
    `Адрес: ${order.address}`,
    `Дата: ${order.requestedDate}`,
    `Время: ${order.requestedTime}`,
    order.totalPrice === null ? 'Цена: не подтверждена' : `Цена: ${order.totalPrice} ₽`,
    order.comment ? `Комментарий: ${order.comment}` : null,
  ].filter(Boolean).join('\n')

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      project: 'domtrack',
      name: order.clientName,
      phone: order.clientPhone,
      service: serviceLabel,
      message: details,
      source: 'Telegram',
      pageUrl: 'https://domtrack.ru',
      pagePath: '/telegram',
      locale: 'ru',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OLNOO CRM returned ${response.status}${body ? `: ${body}` : ''}`)
  }
}
