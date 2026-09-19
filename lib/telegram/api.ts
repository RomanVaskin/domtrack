import type { BotApi, ReplyMarkup } from './types'

interface TelegramApiResponse {
  ok: boolean
  description?: string
}

export class TelegramHttpApi implements BotApi {
  constructor(private readonly token: string) {}

  async sendMessage(
    chatId: string,
    text: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    })
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    })
  }

  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<void> {
    await this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    })
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    const result = (await response.json()) as TelegramApiResponse
    if (!response.ok || !result.ok) {
      throw new Error(`Telegram API request failed with status ${response.status}`)
    }
  }
}
