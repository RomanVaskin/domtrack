export const SERVICE_TYPES = [
  'house_cleaning',
  'window_cleaning',
  'furniture_cleaning',
  'lawn_mowing',
  'snow_removal',
  'leaf_removal',
  'pool_care',
  'handyman',
  'house_prep',
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
  adminOrderId?: string
  referralPartnerId?: string
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
  totalPrice: number | null
  referralPartnerId: string | null
  referralSource: string | null
}

export interface CreatedOrder {
  id: string
  number: string
  /** The order's own stable UUID (orders.source_session_id) — NOT the bigint `id`. Reused as-is
   * as the OLNOO CRM's `lead_tracking_id` so a retried CRM sync can never create a second lead. */
  sourceSessionId: string
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
  totalPrice: number | null
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

export type AssignOrderResult =
  | {
      kind: 'assigned'
      orderNumber: string
      clientToken: string
      workerToken: string
      workerName: string
    }
  | { kind: 'rejected' | 'not_confirmed' | 'not_found' | 'error' }

export type SetOrderPriceResult =
  | { kind: 'set'; orderNumber: string }
  | { kind: 'not_found' | 'error' }

export interface ReferralPartner {
  id: string
  name: string
  code: string
  accessToken: string
  commissionPercent: number
  active: boolean
  createdAt: string
}

export type ReferralCommissionState = 'accrued' | 'pending' | 'price_unconfirmed'

export interface ReferralOrderSummary {
  id: string
  number: string
  createdAt: string
  totalPrice: number | null
  status: string
  statusLabel: string
  commissionState: ReferralCommissionState
  commission: number
}

export interface ReferralPartnerStats {
  id: string
  name: string
  code: string
  active: boolean
  commissionPercent: number
  ordersCount: number
  totalAmount: number
  completedAmount: number
  accruedCommission: number
}

export interface ReferralPartnerDetail extends ReferralPartnerStats {
  orders: ReferralOrderSummary[]
}

export interface ReferralPartnerAdminDetail extends ReferralPartnerDetail {
  accessToken: string
}

export interface SessionStore {
  withChatLock<T>(
    chatId: string,
    operation: (transaction: SessionTransaction) => Promise<T>,
  ): Promise<T>
  findOrderBySessionId(sessionId: string): Promise<CreatedOrder | null>
  confirmOrder(orderId: string): Promise<ConfirmOrderResult>
  assignOrder(orderId: string): Promise<AssignOrderResult>
  rejectOrder(orderId: string): Promise<RejectOrderResult>
  setOrderPrice(orderId: string, price: number): Promise<SetOrderPriceResult>
  getActiveReferralPartnerByCode(code: string): Promise<{ id: string; code: string } | null>
  createReferralPartner(name: string): Promise<ReferralPartner>
  listReferralPartners(): Promise<ReferralPartnerStats[]>
  getReferralPartnerAdminDetail(id: string): Promise<ReferralPartnerAdminDetail | null>
}

export interface SessionTransaction {
  getSession(): Promise<TelegramSession | null>
  saveSession(session: TelegramSession): Promise<void>
  deleteSession(): Promise<void>
  createOrder(order: NewOrder): Promise<CreatedOrder>
}

export interface InlineButton {
  text: string
  callback_data?: string
  url?: string
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
