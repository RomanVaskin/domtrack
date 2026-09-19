export const SERVICE_TYPES = [
  'house_cleaning',
  'window_cleaning',
  'furniture_cleaning',
  'lawn_mowing',
  'snow_removal',
  'leaf_removal',
  'pool_care',
  'other',
] as const

export type ServiceType = (typeof SERVICE_TYPES)[number]

export type OrderParameters = Record<
  string,
  string | number | boolean | string[]
>

export interface SessionData {
  telegramUsername?: string
  serviceType?: ServiceType
  parameters: OrderParameters
  clientName?: string
  clientPhone?: string
  address?: string
  requestedDate?: string
  requestedTime?: string
  photoReportEnabled?: boolean
  comment?: string
}

export interface TelegramSession {
  chatId: string
  sessionId: string
  state: string
  data: SessionData
}

export interface NewOrder {
  sourceSessionId: string
  telegramChatId: string
  telegramUsername?: string
  serviceType: ServiceType
  clientName: string
  clientPhone: string
  address: string
  requestedDate: string
  requestedTime: string
  photoReportEnabled: boolean
  parameters: OrderParameters
  comment?: string
}

export interface CreatedOrder {
  id: string
  number: string
  telegramChatId: string
  serviceType: ServiceType
  clientName: string
  clientPhone: string
  address: string
  requestedDate: string
  requestedTime: string
  photoReportEnabled: boolean
  parameters: OrderParameters
  comment?: string
}

export type ConfirmOrderResult =
  | {
      kind: 'confirmed'
      orderNumber: string
      clientChatId: string
      clientToken: string
      workerToken: string
    }
  | { kind: 'rejected' | 'not_found' | 'error' }

export type RejectOrderResult =
  | { kind: 'rejected'; orderNumber: string; clientChatId: string }
  | { kind: 'confirmed' | 'not_found' | 'error' }

export interface SessionStore {
  withChatLock<T>(
    chatId: string,
    operation: (transaction: SessionTransaction) => Promise<T>,
  ): Promise<T>
  findOrderBySessionId(sessionId: string): Promise<CreatedOrder | null>
  confirmOrder(orderId: string): Promise<ConfirmOrderResult>
  rejectOrder(orderId: string): Promise<RejectOrderResult>
}

export interface SessionTransaction {
  getSession(): Promise<TelegramSession | null>
  saveSession(session: TelegramSession): Promise<void>
  deleteSession(): Promise<void>
  createOrder(order: NewOrder): Promise<CreatedOrder>
}

export interface InlineButton {
  text: string
  callback_data: string
}

export interface ReplyMarkup {
  inline_keyboard?: InlineButton[][]
  keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>
  resize_keyboard?: boolean
  one_time_keyboard?: boolean
  remove_keyboard?: boolean
}

export interface BotApi {
  sendMessage(
    chatId: string,
    text: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<void>
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>
  editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<void>
}

export interface TelegramUser {
  username?: string
}

export interface TelegramMessage {
  message_id?: number
  chat: { id: number | string }
  from?: TelegramUser
  text?: string
  contact?: { phone_number: string; user_id?: number }
  photo?: Array<{ file_id: string; width: number; height: number }>
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  data?: string
  message?: { message_id?: number; chat: { id: number | string } }
}

export interface TelegramUpdate {
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}
