import { timingSafeEqual } from 'node:crypto'
import { TelegramHttpApi } from '@/lib/telegram/api'
import { TelegramOrderFlow } from '@/lib/telegram/flow'
import { PostgresSessionStore } from '@/lib/telegram/postgres-store'
import type { TelegramUpdate } from '@/lib/telegram/types'

export const runtime = 'nodejs'

function validWebhookSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return true
  const received = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

export async function POST(request: Request): Promise<Response> {
  if (!validWebhookSecret(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('Telegram webhook is not configured')
    return new Response('Service unavailable', { status: 503 })
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  try {
    const flow = new TelegramOrderFlow(
      new PostgresSessionStore(),
      new TelegramHttpApi(token),
    )
    await flow.handleUpdate(update)
    return Response.json({ ok: true })
  } catch {
    // Do not include update contents: it may contain a phone, address or other PII.
    console.error('Telegram webhook processing failed')
    return new Response('Internal server error', { status: 500 })
  }
}
