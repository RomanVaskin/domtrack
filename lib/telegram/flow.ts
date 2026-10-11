import { randomUUID } from 'node:crypto'
import { domTrackUrl } from '../domtrack-url.ts'
import { calculatePrice, formatPriceDisplay, formatRubles } from '../pricing.ts'
import { sendOrderToOlnooCrm } from '../olnoo-crm.ts'
import { TELEGRAM_CONTACT_URL } from '../telegram-contact.ts'
import type {
  BotApi,
  CreatedOrder,
  InlineButton,
  NewOrder,
  ReferralPartnerAdminDetail,
  ReferralPartnerStats,
  ReplyMarkup,
  ServiceType,
  SessionData,
  SessionStore,
  SessionTransaction,
  TelegramMessage,
  TelegramSession,
  TelegramUpdate,
} from './types'

export const SERVICE_LABELS: Record<ServiceType, string> = {
  house_cleaning: 'Уборка дома',
  window_cleaning: 'Окна и фасад',
  furniture_cleaning: 'Химчистка мебели',
  lawn_mowing: 'Стрижка газона',
  snow_removal: 'Уборка снега',
  leaf_removal: 'Уборка листьев',
  pool_care: 'Бассейн',
  handyman: 'Мастер по дому',
  house_prep: 'Подготовить дом к приезду',
  other: 'Другое',
}

const PUBLIC_SERVICE_TYPES: ServiceType[] = [
  'house_cleaning',
  'lawn_mowing',
  'snow_removal',
  'leaf_removal',
  'window_cleaning',
  'handyman',
  'pool_care',
]

const SERVICE_BUTTONS: InlineButton[][] = PUBLIC_SERVICE_TYPES.map(
  (value) => [{ text: SERVICE_LABELS[value], callback_data: `service:${value}` }],
)

const YES_NO: InlineButton[][] = [
  [
    { text: 'Да', callback_data: 'yes' },
    { text: 'Нет', callback_data: 'no' },
  ],
]

const PHOTO_REPORT: InlineButton[][] = [
  [{ text: 'Да, нужен фотоотчёт', callback_data: 'report:yes' }],
  [{ text: 'Нет, без фото', callback_data: 'report:no' }],
]

interface OutgoingMessage {
  text: string
  replyMarkup?: ReplyMarkup
}

interface TransitionResult {
  messages: OutgoingMessage[]
  submittedOrder?: CreatedOrder
}

export interface TelegramFlowOptions {
  now?: () => Date
}

export class TelegramOrderFlow {
  private readonly now: () => Date
  private readonly store: SessionStore
  private readonly bot: BotApi

  constructor(
    store: SessionStore,
    bot: BotApi,
    options: TelegramFlowOptions = {},
  ) {
    this.store = store
    this.bot = bot
    this.now = options.now ?? (() => new Date())
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.message) {
      await this.handleMessage(update.message)
      return
    }

    const callback = update.callback_query
    if (!callback?.message || !callback.data) return

    const adminAction = callback.data.match(/^a:(c|r|a):(\d+)$/)
    if (adminAction) {
      await this.handleAdminCallback(
        callback,
        adminAction[1] === 'c' ? 'confirm' : adminAction[1] === 'a' ? 'assign' : 'reject',
        adminAction[2],
      )
      return
    }

    const adminPriceAction = callback.data.match(/^a:p:(\d+)$/)
    if (adminPriceAction) {
      await this.handleAdminPriceRequest(callback, adminPriceAction[1])
      return
    }

    const referralAdminAction = callback.data.match(/^rf:(list|new|open):?(.*)$/)
    if (referralAdminAction) {
      await this.handleReferralAdminCallback(
        callback,
        referralAdminAction[1] as 'list' | 'new' | 'open',
        referralAdminAction[2],
      )
      return
    }

    await this.safeAnswerCallback(callback.id)
    const chatId = String(callback.message.chat.id)
    const callbackData = callback.data
    const result = callbackData.startsWith('submit:')
      ? await this.submit(chatId, callbackData.slice('submit:'.length))
      : await this.store.withChatLock(chatId, async (transaction) => {
          const session = await transaction.getSession()
          if (!session) return restartResult()
          if (callback.from.username) {
            session.data.telegramUsername = callback.from.username
          }
          return this.processCallback(transaction, session, callbackData)
        })

    await this.deliver(chatId, result)
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const chatId = String(message.chat.id)
    if (message.text && /^\/myid(?:@\w+)?(?:\s|$)/i.test(message.text)) {
      await this.bot.sendMessage(chatId, `Ваш Telegram chat_id: ${chatId}`)
      return
    }
    const startMatch = message.text?.match(/^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/i)
    if (startMatch) {
      const payload = startMatch[1]
      if (payload === 'partner') {
        await this.handleStartPartnerInquiry(chatId, message.from?.username)
        return
      }
      const refMatch = payload?.match(/^ref_([A-Za-z0-9]+)$/)
      await this.handleStart(chatId, message.from?.username, refMatch ? refMatch[1] : null)
      return
    }

    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
    if (adminChatId && chatId === adminChatId) {
      if (/^\/referrals(?:@\w+)?(?:\s|$)/i.test(message.text ?? '')) {
        await this.bot.sendMessage(chatId, 'Рефералы', referralsMenuKeyboard())
        return
      }
      const handled = await this.tryHandleAdminMessage(chatId, message)
      if (handled) return
    }

    const result = await this.store.withChatLock(chatId, async (transaction) => {
      const session = await transaction.getSession()
      if (!session) return restartResult()
      if (message.from?.username) {
        session.data.telegramUsername = message.from.username
      }
      return this.processUserMessage(transaction, session, message)
    })
    await this.deliver(chatId, result)
  }

  private async deliver(chatId: string, result: TransitionResult): Promise<void> {
    const deliveries = result.messages.map((message) =>
      this.bot.sendMessage(chatId, message.text, message.replyMarkup),
    )
    if (result.submittedOrder) {
      deliveries.push(
        this.notifyAdminOfNewOrder(result.submittedOrder),
        sendOrderToOlnooCrm(
          result.submittedOrder,
          SERVICE_LABELS[result.submittedOrder.serviceType],
        ),
      )
    }
    const outcomes = await Promise.allSettled(deliveries)
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      console.warn('[telegram-webhook] Telegram notification failed')
    }
  }

  private async notifyAdminOfNewOrder(order: CreatedOrder): Promise<void> {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
    if (!adminChatId) {
      console.warn('[telegram-webhook] Admin chat is not configured')
      return
    }
    await this.bot.sendMessage(adminChatId, buildAdminOrderText(order), {
      inline_keyboard: [[
        { text: '✅ Подтвердить', callback_data: `a:c:${order.id}` },
        { text: '❌ Отклонить', callback_data: `a:r:${order.id}` },
        { text: '💰 Указать цену', callback_data: `a:p:${order.id}` },
      ]],
    })
  }

  private async handleAdminPriceRequest(
    callback: NonNullable<TelegramUpdate['callback_query']>,
    orderId: string,
  ): Promise<void> {
    const message = callback.message
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
    if (!message || !adminChatId || String(message.chat.id) !== adminChatId) {
      await this.safeAnswerCallback(callback.id, 'Недоступно.')
      return
    }
    await this.store.withChatLock(adminChatId, async (transaction) => {
      await transaction.saveSession({
        chatId: adminChatId,
        sessionId: randomUUID(),
        state: 'admin_awaiting_price',
        data: { parameters: {}, adminOrderId: orderId },
      })
    })
    await this.safeAnswerCallback(callback.id)
    await this.bot.sendMessage(adminChatId, 'Введите стоимость заказа в рублях.')
  }

  private async tryHandleAdminMessage(
    chatId: string,
    message: TelegramMessage,
  ): Promise<boolean> {
    const pending = await this.store.withChatLock(chatId, async (transaction) => {
      const session = await transaction.getSession()
      if (!session) return null
      if (session.state === 'admin_awaiting_price' && session.data.adminOrderId) {
        return { kind: 'price' as const, orderId: session.data.adminOrderId }
      }
      if (session.state === 'admin_awaiting_referral_name') {
        return { kind: 'referral_name' as const }
      }
      return null
    })
    if (!pending) return false

    if (pending.kind === 'price') {
      const price = parseInteger(message.text?.trim(), 0, 10_000_000)
      if (price === null) {
        await this.bot.sendMessage(chatId, 'Введите целое число рублей, не меньше 0.')
        return true
      }
      const result = await this.store.setOrderPrice(pending.orderId, price)
      await this.store.withChatLock(chatId, async (transaction) => transaction.deleteSession())
      if (result.kind !== 'set') {
        await this.bot.sendMessage(chatId, 'Заявка не найдена.')
        return true
      }
      await this.bot.sendMessage(
        chatId,
        `Стоимость заказа ${result.orderNumber} установлена: ${formatRubles(price)}.`,
      )
      return true
    }

    const name = message.text?.trim()
    if (!validText(name, 1, 120)) {
      await this.bot.sendMessage(chatId, 'Введите имя партнёра длиной от 1 до 120 символов.')
      return true
    }
    const partner = await this.store.createReferralPartner(name!)
    await this.store.withChatLock(chatId, async (transaction) => transaction.deleteSession())
    await this.bot.sendMessage(chatId, referralPartnerCreatedText(partner))
    return true
  }

  private async handleStart(
    chatId: string,
    username: string | undefined,
    referralCode: string | null,
  ): Promise<void> {
    const partner = referralCode ? await this.store.getActiveReferralPartnerByCode(referralCode) : null
    const result = await this.store.withChatLock(chatId, async (transaction) => {
      const session = newSession(chatId, username, partner?.id)
      await transaction.saveSession(session)
      return {
        messages: [
          {
            text:
              'Добро пожаловать в DomTrack.\n\nЗакажите услугу для дома или участка за пару минут.',
            replyMarkup: inline([
              [{ text: 'Заказать услугу', callback_data: 'begin' }],
            ]),
          },
        ],
      }
    })
    await this.deliver(chatId, result)
  }

  /**
   * /start partner (the public /partners page's CTA). No partner is created automatically —
   * this only gives the requester a clear next step and nudges the admin to follow up via the
   * existing /referrals → "Создать реферала" flow. No new DB write, no new session state.
   */
  private async handleStartPartnerInquiry(chatId: string, username?: string): Promise<void> {
    await this.store.withChatLock(chatId, async (transaction) => transaction.deleteSession())

    const adminUsername = getTelegramAdminUsername()
    if (adminUsername) {
      await this.bot.sendMessage(
        chatId,
        'Хотите стать партнёром DomTrack?\n\n'
          + 'Напишите администратору — мы создадим для вас персональные ссылки и доступ к статистике.',
        { inline_keyboard: [[{ text: 'Написать администратору', url: `https://t.me/${adminUsername}` }]] },
      )
    } else {
      await this.bot.sendMessage(
        chatId,
        'Хотите стать партнёром DomTrack?\n\n'
          + 'Администратор уже получил уведомление о вашем запросе и свяжется с вами, если это возможно.',
      )
    }

    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
    if (!adminChatId) return
    const contact = username ? `@${username}` : `chat_id ${chatId}`
    try {
      await this.bot.sendMessage(
        adminChatId,
        `🤝 Запрос на партнёрство от ${contact}.\n\nСоздать партнёра: /referrals → «Создать реферала».`,
      )
    } catch {
      console.warn('[telegram-webhook] Partner inquiry notification failed')
    }
  }

  private async handleReferralAdminCallback(
    callback: NonNullable<TelegramUpdate['callback_query']>,
    kind: 'list' | 'new' | 'open',
    arg: string,
  ): Promise<void> {
    const message = callback.message
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
    if (!message || !adminChatId || String(message.chat.id) !== adminChatId) {
      await this.safeAnswerCallback(callback.id, 'Недоступно.')
      return
    }
    await this.safeAnswerCallback(callback.id)

    if (kind === 'new') {
      await this.store.withChatLock(adminChatId, async (transaction) => {
        await transaction.saveSession({
          chatId: adminChatId,
          sessionId: randomUUID(),
          state: 'admin_awaiting_referral_name',
          data: { parameters: {} },
        })
      })
      await this.bot.sendMessage(adminChatId, 'Введите имя или название партнёра.')
      return
    }

    if (kind === 'list') {
      const partners = await this.store.listReferralPartners()
      if (partners.length === 0) {
        await this.bot.sendMessage(adminChatId, 'Рефералов пока нет.')
        return
      }
      await this.bot.sendMessage(adminChatId, referralPartnerListText(partners), {
        inline_keyboard: partners.map((partner) => [{
          text: `${partner.active ? '' : '🚫 '}${partner.name}`,
          callback_data: `rf:open:${partner.id}`,
        }]),
      })
      return
    }

    const partner = await this.store.getReferralPartnerAdminDetail(arg)
    if (!partner) {
      await this.bot.sendMessage(adminChatId, 'Партнёр не найден.')
      return
    }
    await this.bot.sendMessage(adminChatId, referralPartnerDetailText(partner))
  }

  private async safeAnswerCallback(callbackId: string, text?: string): Promise<void> {
    try {
      await this.bot.answerCallbackQuery(callbackId, text)
    } catch {
      console.warn('[telegram-webhook] Failed to acknowledge callback')
    }
  }

  private async handleAdminCallback(
    callback: NonNullable<TelegramUpdate['callback_query']>,
    action: 'confirm' | 'assign' | 'reject',
    orderId: string,
  ): Promise<void> {
    const message = callback.message
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
    if (!message || !adminChatId || String(message.chat.id) !== adminChatId) {
      await this.safeAnswerCallback(callback.id, 'Недоступно.')
      return
    }

    if (action === 'confirm') {
      const result = await this.store.confirmOrder(orderId)
      if (result.kind === 'rejected') {
        await this.safeAnswerCallback(callback.id, 'Заявка уже отклонена.')
        return
      }
      if (result.kind !== 'confirmed') {
        await this.safeAnswerCallback(callback.id, 'Заявка не найдена.')
        return
      }

      const clientUrl = domTrackUrl(`/o/${encodeURIComponent(result.clientToken)}`)
      const workerUrl = domTrackUrl(`/worker/${encodeURIComponent(result.workerToken)}`)
      await this.safeAnswerCallback(callback.id, 'Заявка подтверждена.')
      const adminText = `✅ Заявка ${result.orderNumber} подтверждена.\n\n`
        + `Клиент:\n${clientUrl}\n\nИсполнитель:\n${workerUrl}`
      const assignmentButton = {
        inline_keyboard: [[{ text: 'Назначить исполнителя', callback_data: `a:a:${orderId}` }]],
      }
      const deliveries: Promise<void>[] = [
        this.bot.sendMessage(
          result.clientChatId,
          `✅ Ваша заявка ${result.orderNumber} подтверждена.\n\n`
            + `Персональная ссылка DomTrack:\n${clientUrl}\n\n`
            + 'Здесь вы сможете следить за исполнителем и ходом работы.',
        ),
        message.message_id === undefined
          ? this.bot.sendMessage(adminChatId, adminText, assignmentButton)
          : this.bot.editMessageText(adminChatId, message.message_id, adminText, assignmentButton),
      ]
      const outcomes = await Promise.allSettled(deliveries)
      if (outcomes.some((outcome) => outcome.status === 'rejected')) {
        console.warn('[telegram-webhook] Confirmation notification failed')
      }
      return
    }

    if (action === 'assign') {
      const result = await this.store.assignOrder(orderId)
      if (result.kind === 'rejected') {
        await this.safeAnswerCallback(callback.id, 'Заявка уже отклонена.')
        return
      }
      if (result.kind === 'not_confirmed') {
        await this.safeAnswerCallback(callback.id, 'Сначала подтвердите заявку.')
        return
      }
      if (result.kind !== 'assigned') {
        await this.safeAnswerCallback(callback.id, 'Заявка не найдена.')
        return
      }

      const clientUrl = domTrackUrl(`/o/${encodeURIComponent(result.clientToken)}`)
      const workerUrl = domTrackUrl(`/worker/${encodeURIComponent(result.workerToken)}`)
      await this.safeAnswerCallback(callback.id, 'Исполнитель назначен.')
      const adminText = `👷 Заявка ${result.orderNumber}: исполнитель назначен.\n\n`
        + `Клиент:\n${clientUrl}\n\nИсполнитель:\n${workerUrl}`
      if (message.message_id === undefined) {
        await this.bot.sendMessage(adminChatId, adminText)
      } else {
        await this.bot.editMessageText(adminChatId, message.message_id, adminText, { inline_keyboard: [] })
      }
      return
    }

    const result = await this.store.rejectOrder(orderId)
    if (result.kind === 'confirmed') {
      await this.safeAnswerCallback(callback.id, 'Заявка уже подтверждена.')
      return
    }
    if (result.kind !== 'rejected') {
      await this.safeAnswerCallback(callback.id, 'Заявка не найдена.')
      return
    }

    await this.safeAnswerCallback(callback.id, 'Заявка отклонена.')
    const adminText = `❌ Заявка ${result.orderNumber} отклонена.`
    const deliveries: Promise<void>[] = [
      this.bot.sendMessage(
        result.clientChatId,
        `Заявка ${result.orderNumber} не подтверждена.\n\n`
          + 'Если это произошло по ошибке, оформите новую заявку или свяжитесь с нами.',
      ),
      message.message_id === undefined
        ? this.bot.sendMessage(adminChatId, adminText)
        : this.bot.editMessageText(adminChatId, message.message_id, adminText, { inline_keyboard: [] }),
    ]
    const outcomes = await Promise.allSettled(deliveries)
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      console.warn('[telegram-webhook] Rejection notification failed')
    }
  }

  private async processCallback(
    transaction: SessionTransaction,
    session: TelegramSession,
    callbackData: string,
  ): Promise<TransitionResult> {
    if (callbackData === 'begin' && session.state === 'awaiting_begin') {
      return saveAndReply(transaction, session, 'awaiting_service', {
        text: 'Что нужно сделать?',
        replyMarkup: inline(SERVICE_BUTTONS),
      })
    }

    if (callbackData.startsWith('service:') && session.state === 'awaiting_service') {
      const serviceType = callbackData.slice('service:'.length) as ServiceType
      if (!Object.prototype.hasOwnProperty.call(SERVICE_LABELS, serviceType)) {
        return staleResult()
      }
      session.data.serviceType = serviceType
      session.data.parameters = {}
      const first = firstServiceQuestion(serviceType)
      return saveAndReply(transaction, session, first.state, first.message)
    }

    switch (session.state) {
      case 'house_floors': {
        const floors = callbackData === 'floors:4' ? 4 : parseIntegerCallback(callbackData, 'floors:', 1, 3)
        if (floors === null) return staleResult()
        session.data.parameters.floors = floors
        return saveAndReply(transaction, session, 'cleaning_tier', {
          text: 'Какой вид уборки нужен?',
          replyMarkup: inline([
            [{ text: 'Поддерживающая уборка', callback_data: 'tier:supporting' }],
            [{ text: 'Генеральная уборка', callback_data: 'tier:general' }],
            [{ text: 'Уборка после ремонта', callback_data: 'tier:post_renovation' }],
          ]),
        })
      }
      case 'windows_count': {
        if (callbackData === 'windows:6plus') {
          return saveAndReply(transaction, session, 'windows_count_exact', {
            text: 'Укажите точное количество окон.',
          })
        }
        const count = parseIntegerCallback(callbackData, 'windows:', 1, 5)
        if (count === null) return staleResult()
        session.data.parameters.windows_count = count
        return askPanoramicWindows(transaction, session)
      }
      case 'windows_panoramic': {
        const value = parseYesNo(callbackData)
        if (value === null) return staleResult()
        session.data.parameters.panoramic_windows = value
        return askPhotoReport(transaction, session)
      }
      case 'cleaning_tier': {
        const tiers: Record<string, string> = {
          'tier:supporting': 'supporting',
          'tier:general': 'general',
          'tier:post_renovation': 'post_renovation',
        }
        const tier = tiers[callbackData]
        if (!tier) return staleResult()
        session.data.parameters.cleaning_tier = tier
        return askPhotoReport(transaction, session)
      }
      case 'collect_grass':
        return setBooleanAndContinue(transaction, session, callbackData, 'collect_grass', 'remove_grass', 'Нужен вывоз травы?')
      case 'remove_grass':
        return setBooleanAndAskReport(transaction, session, callbackData, 'remove_grass')
      case 'pool_type': {
        const types: Record<string, string> = {
          'pool:one_time': 'one_time',
          'pool:regular': 'regular',
          'pool:winterization': 'winterization',
          'pool:de_winterization': 'de_winterization',
        }
        const poolType = types[callbackData]
        if (!poolType) return staleResult()
        session.data.parameters.pool_type = poolType
        return saveAndReply(transaction, session, 'pool_description', {
          text: POOL_DESCRIPTION_PROMPT,
        })
      }
      case 'snow_zone': {
        const zones: Record<string, string> = {
          'snow:parking': 'Парковка / въезд',
          'snow:paths': 'Дорожки',
          'snow:both': 'Парковка + дорожки',
          'snow:other': 'Другое',
        }
        const zone = zones[callbackData]
        if (!zone) return staleResult()
        session.data.parameters.snow_zone = zone
        if (callbackData === 'snow:other') {
          return saveAndReply(transaction, session, 'snow_zone_other', {
            text: 'Опишите, что нужно очистить от снега.',
          })
        }
        return askSnowArea(transaction, session)
      }
      case 'remove_snow': {
        const value = parseYesNo(callbackData)
        if (value === null) return staleResult()
        session.data.parameters.remove_snow = value
        return saveAndReply(transaction, session, 'snow_urgent', {
          text: 'Нужна срочная уборка?',
          replyMarkup: inline(YES_NO),
        })
      }
      case 'snow_urgent':
        return setBooleanAndAskReport(transaction, session, callbackData, 'urgent')
      case 'bag_leaves':
        return setBooleanAndContinue(transaction, session, callbackData, 'bag_leaves', 'remove_leaves', 'Нужен вывоз листьев?')
      case 'remove_leaves':
        return setBooleanAndAskReport(transaction, session, callbackData, 'remove_leaves')
      case 'service_photos': {
        if (callbackData !== 'photos:skip' && callbackData !== 'photos:done') {
          return staleResult()
        }
        if (
          callbackData === 'photos:done' &&
          !Array.isArray(session.data.parameters.telegram_photo_file_ids)
        ) {
          return staleResult()
        }
        return askPhotoReport(transaction, session)
      }
      case 'photo_report': {
        if (callbackData !== 'report:yes' && callbackData !== 'report:no') {
          return staleResult()
        }
        session.data.photoReportEnabled = callbackData === 'report:yes'
        return saveAndReply(transaction, session, 'client_name', {
          text: 'Как к вам обращаться?',
        })
      }
      case 'requested_date': {
        if (callbackData === 'date:other') {
          return saveAndReply(transaction, session, 'requested_date_custom', {
            text: 'Введите дату в формате ДД.ММ.ГГГГ.',
          })
        }
        if (callbackData !== 'date:today' && callbackData !== 'date:tomorrow') {
          return staleResult()
        }
        session.data.requestedDate = addDays(
          moscowToday(this.now()),
          callbackData === 'date:tomorrow' ? 1 : 0,
        )
        return askTime(transaction, session)
      }
      case 'requested_time': {
        const times: Record<string, string> = {
          'time:09': '09:00–12:00',
          'time:12': '12:00–15:00',
          'time:15': '15:00–18:00',
          'time:18': '18:00–21:00',
        }
        if (callbackData === 'time:other') {
          return saveAndReply(transaction, session, 'requested_time_custom', {
            text: 'Укажите удобное время коротким текстом.',
          })
        }
        if (!times[callbackData]) return staleResult()
        session.data.requestedTime = times[callbackData]
        return askComment(transaction, session)
      }
      case 'comment_choice': {
        if (callbackData === 'comment:none') {
          delete session.data.comment
          return showReview(transaction, session)
        }
        if (callbackData === 'comment:write') {
          return saveAndReply(transaction, session, 'comment_text', {
            text: 'Напишите дополнительные пожелания.',
          })
        }
        return staleResult()
      }
      case 'review':
        if (callbackData === 'edit') {
          session.sessionId = randomUUID()
          session.data = {
            telegramUsername: session.data.telegramUsername,
            parameters: {},
            referralPartnerId: session.data.referralPartnerId,
          }
          return saveAndReply(transaction, session, 'awaiting_service', {
            text: 'Что нужно сделать?',
            replyMarkup: inline(SERVICE_BUTTONS),
          })
        }
        return staleResult()
      default:
        return staleResult()
    }
  }

  private async processUserMessage(
    transaction: SessionTransaction,
    session: TelegramSession,
    message: TelegramMessage,
  ): Promise<TransitionResult> {
    const text = message.text?.trim()

    switch (session.state) {
      case 'house_area': {
        const value = parseInteger(text, 20, 2000)
        if (value === null) return invalid('Введите целое число от 20 до 2000.')
        session.data.parameters.house_area = value
        return saveAndReply(transaction, session, 'house_floors', {
          text: 'Сколько этажей?',
          replyMarkup: inline([
            [1, 2, 3, 4].map((value) => ({
              text: value === 4 ? '4+' : String(value),
              callback_data: `floors:${value}`,
            })),
          ]),
        })
      }
      case 'windows_count_exact': {
        const value = parseInteger(text, 6, 1000)
        if (value === null) return invalid('Введите целое число от 6 до 1000.')
        session.data.parameters.windows_count = value
        return askPanoramicWindows(transaction, session)
      }
      case 'furniture_description': {
        if (!validText(text, 1, 500)) return invalid('Введите описание от 1 до 500 символов.')
        session.data.parameters.furniture_description = text!
        return askServicePhotos(transaction, session, 'Можете отправить фотографии мебели или нажать «Без фото».')
      }
      case 'lawn_area': {
        const value = parseInteger(text, 1, 1_000_000)
        if (value === null) return invalid('Введите целую площадь от 1 до 1 000 000 м².')
        session.data.parameters.lawn_area = value
        return saveAndReply(transaction, session, 'collect_grass', {
          text: 'Нужно собрать скошенную траву?',
          replyMarkup: inline(YES_NO),
        })
      }
      case 'snow_zone_other': {
        if (!validText(text, 1, 500)) return invalid('Введите описание от 1 до 500 символов.')
        session.data.parameters.snow_zone_description = text!
        return askSnowArea(transaction, session)
      }
      case 'snow_area': {
        const value = parseInteger(text, 1, 1_000_000)
        if (value === null) return invalid('Введите целую площадь от 1 до 1 000 000 м².')
        session.data.parameters.snow_area = value
        return saveAndReply(transaction, session, 'remove_snow', {
          text: 'Нужно вывезти снег?',
          replyMarkup: inline(YES_NO),
        })
      }
      case 'plot_area': {
        const value = parseInteger(text, 1, 1_000_000)
        if (value === null) return invalid('Введите целую площадь от 1 до 1 000 000 м².')
        session.data.parameters.plot_area = value
        return saveAndReply(transaction, session, 'bag_leaves', {
          text: 'Нужно собрать листья в мешки?',
          replyMarkup: inline(YES_NO),
        })
      }
      case 'handyman_hours': {
        const value = parseInteger(text, 1, 24)
        if (value === null) return invalid('Введите целое число часов от 1 до 24.')
        session.data.parameters.handyman_hours = value
        return askPhotoReport(transaction, session)
      }
      case 'pool_description': {
        if (!validText(text, 1, 700)) return invalid('Введите описание от 1 до 700 символов.')
        session.data.parameters.pool_description = text!
        return askServicePhotos(transaction, session, 'Можете отправить фотографию бассейна или нажать «Без фото».')
      }
      case 'other_description': {
        if (!validText(text, 1, 700)) return invalid('Введите описание от 1 до 700 символов.')
        session.data.parameters.other_description = text!
        return askServicePhotos(transaction, session, 'Можете отправить фото задачи или нажать «Без фото».')
      }
      case 'service_photos': {
        const photo = message.photo?.at(-1)
        if (!photo) return invalid('Отправьте фото или нажмите «Без фото».')
        const existing = session.data.parameters.telegram_photo_file_ids
        const fileIds = Array.isArray(existing) ? existing : []
        if (!fileIds.includes(photo.file_id)) fileIds.push(photo.file_id)
        session.data.parameters.telegram_photo_file_ids = fileIds
        await transaction.saveSession(session)
        return {
          messages: [
            {
              text: 'Фото добавлено. Можно отправить ещё или нажать «Готово».',
              replyMarkup: inline([
                [{ text: 'Готово', callback_data: 'photos:done' }],
              ]),
            },
          ],
        }
      }
      case 'client_name': {
        if (!validText(text, 1, 120)) return invalid('Введите имя от 1 до 120 символов.')
        session.data.clientName = text!
        return saveAndReply(transaction, session, 'client_phone', {
          text: 'Укажите номер телефона.',
          replyMarkup: {
            keyboard: [[{ text: 'Отправить номер телефона', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        })
      }
      case 'client_phone': {
        const phone = message.contact?.phone_number.trim() ?? text
        if (!validText(phone, 1, 40)) {
          return invalid('Отправьте контакт или введите номер телефона длиной до 40 символов.')
        }
        session.data.clientPhone = phone!
        return saveAndReply(transaction, session, 'address', {
          text: 'Укажите адрес объекта.',
          replyMarkup: { remove_keyboard: true },
        })
      }
      case 'address': {
        if (!validText(text, 1, 300)) return invalid('Введите адрес от 1 до 300 символов.')
        session.data.address = text!
        return saveAndReply(transaction, session, 'requested_date', {
          text: 'Когда удобно выполнить работу?',
          replyMarkup: inline([
            [
              { text: 'Сегодня', callback_data: 'date:today' },
              { text: 'Завтра', callback_data: 'date:tomorrow' },
            ],
            [{ text: 'Выбрать другую дату', callback_data: 'date:other' }],
          ]),
        })
      }
      case 'requested_date_custom': {
        const date = parseRussianDate(text)
        if (!date || date < moscowToday(this.now())) {
          return invalid('Введите корректную дату не в прошлом в формате ДД.ММ.ГГГГ.')
        }
        session.data.requestedDate = date
        return askTime(transaction, session)
      }
      case 'requested_time_custom': {
        if (!validText(text, 1, 100)) return invalid('Введите время текстом длиной до 100 символов.')
        session.data.requestedTime = text!
        return askComment(transaction, session)
      }
      case 'comment_text': {
        if (!validText(text, 1, 700)) return invalid('Введите комментарий от 1 до 700 символов.')
        session.data.comment = text!
        return showReview(transaction, session)
      }
      default:
        return staleResult()
    }
  }

  private async submit(chatId: string, sessionId: string): Promise<TransitionResult> {
    const result = await this.store.withChatLock(chatId, async (transaction) => {
      const session = await transaction.getSession()
      if (!session || session.sessionId !== sessionId || session.state !== 'review') {
        return null
      }
      const order = toNewOrder(session)
      if (!order) return null
      const created = await transaction.createOrder(order)
      await transaction.deleteSession()
      return created
    })

    const created = result ?? (await this.store.findOrderBySessionId(sessionId))
    if (!created) return restartResult()
    return {
      // Only the callback that consumed the live session sends the admin notification.
      // A replay still gets the same receipt without producing a duplicate admin card.
      ...(result ? { submittedOrder: created } : {}),
      messages: [
        {
          text:
            `✅ Заявка ${created.number} принята.\n\n` +
            'Мы подтвердим стоимость и время выполнения.\n\n' +
            'После подтверждения вы получите персональную ссылку DomTrack, где сможете следить за исполнителем и ходом работы.',
        },
      ],
    }
  }
}

function newSession(
  chatId: string,
  username?: string,
  referralPartnerId?: string,
): TelegramSession {
  return {
    chatId,
    sessionId: randomUUID(),
    state: 'awaiting_begin',
    data: {
      telegramUsername: username,
      parameters: {},
      ...(referralPartnerId ? { referralPartnerId } : {}),
    },
  }
}

function firstServiceQuestion(serviceType: ServiceType): {
  state: string
  message: OutgoingMessage
} {
  switch (serviceType) {
    case 'house_cleaning':
      return { state: 'house_area', message: { text: 'Какая площадь дома?' } }
    case 'window_cleaning':
      return {
        state: 'windows_count',
        message: {
          text: 'Сколько окон нужно помыть?',
          replyMarkup: inline([
            [1, 2, 3].map(numberButton('windows:')),
            [4, 5].map(numberButton('windows:')).concat({ text: '6+', callback_data: 'windows:6plus' }),
          ]),
        },
      }
    case 'furniture_cleaning':
      return {
        state: 'furniture_description',
        message: { text: 'Что нужно почистить?\n\nНапример: диван, 4 стула, кресло.' },
      }
    case 'lawn_mowing':
      return { state: 'lawn_area', message: { text: 'Какая площадь газона?' } }
    case 'snow_removal':
      return {
        state: 'snow_zone',
        message: {
          text: 'Что нужно очистить от снега?',
          replyMarkup: inline([
            [{ text: 'Парковка / въезд', callback_data: 'snow:parking' }],
            [{ text: 'Дорожки', callback_data: 'snow:paths' }],
            [{ text: 'Парковка + дорожки', callback_data: 'snow:both' }],
            [{ text: 'Другое', callback_data: 'snow:other' }],
          ]),
        },
      }
    case 'leaf_removal':
      return { state: 'plot_area', message: { text: 'Какая примерная площадь участка?' } }
    case 'pool_care':
      return {
        state: 'pool_type',
        message: {
          text: 'Что нужно сделать с бассейном?',
          replyMarkup: inline([
            [{ text: 'Разовый сервис', callback_data: 'pool:one_time' }],
            [{ text: 'Регулярное обслуживание', callback_data: 'pool:regular' }],
            [{ text: 'Консервация', callback_data: 'pool:winterization' }],
            [{ text: 'Расконсервация', callback_data: 'pool:de_winterization' }],
          ]),
        },
      }
    case 'handyman':
      return { state: 'handyman_hours', message: { text: 'Сколько часов примерно?' } }
    case 'house_prep':
      return {
        state: 'photo_report',
        message: {
          text:
            'Подготовим дом к вашему приезду: проверим коммуникации, протопим, уберём.\n\n' +
            'Предварительная стоимость: от 9 900 ₽. Точную стоимость подтвердит администратор.\n\n' +
            'Нужен фотоотчёт после работы?\n\nФото используются только для подтверждения выполненной работы в вашей персональной ссылке.',
          replyMarkup: inline(PHOTO_REPORT),
        },
      }
    case 'other':
      return { state: 'other_description', message: { text: 'Опишите, что нужно сделать.' } }
  }
}

const POOL_DESCRIPTION_PROMPT =
  'Опишите бассейн и что нужно сделать.\n\nНапример: открытый бассейн 8×4 м, нужна очистка воды и чаши.'

function numberButton(prefix: string) {
  return (value: number): InlineButton => ({ text: String(value), callback_data: `${prefix}${value}` })
}

async function askPanoramicWindows(transaction: SessionTransaction, session: TelegramSession) {
  return saveAndReply(transaction, session, 'windows_panoramic', {
    text: 'Есть панорамные окна или сложное остекление?',
    replyMarkup: inline(YES_NO),
  })
}

async function askSnowArea(transaction: SessionTransaction, session: TelegramSession) {
  return saveAndReply(transaction, session, 'snow_area', {
    text: 'Укажите примерную площадь уборки в м².',
  })
}

async function askServicePhotos(
  transaction: SessionTransaction,
  session: TelegramSession,
  text: string,
) {
  return saveAndReply(transaction, session, 'service_photos', {
    text,
    replyMarkup: inline([[{ text: 'Без фото', callback_data: 'photos:skip' }]]),
  })
}

async function askPhotoReport(transaction: SessionTransaction, session: TelegramSession) {
  return saveAndReply(transaction, session, 'photo_report', {
    text:
      'Нужен фотоотчёт после работы?\n\nФото используются только для подтверждения выполненной работы в вашей персональной ссылке.',
    replyMarkup: inline(PHOTO_REPORT),
  })
}

async function askTime(transaction: SessionTransaction, session: TelegramSession) {
  return saveAndReply(transaction, session, 'requested_time', {
    text: 'В какое время удобно?',
    replyMarkup: inline([
      [{ text: '09:00–12:00', callback_data: 'time:09' }],
      [{ text: '12:00–15:00', callback_data: 'time:12' }],
      [{ text: '15:00–18:00', callback_data: 'time:15' }],
      [{ text: '18:00–21:00', callback_data: 'time:18' }],
      [{ text: 'Другое', callback_data: 'time:other' }],
    ]),
  })
}

async function askComment(transaction: SessionTransaction, session: TelegramSession) {
  return saveAndReply(transaction, session, 'comment_choice', {
    text: 'Есть дополнительные пожелания?',
    replyMarkup: inline([
      [
        { text: 'Нет', callback_data: 'comment:none' },
        { text: 'Написать', callback_data: 'comment:write' },
      ],
    ]),
  })
}

async function setBooleanAndContinue(
  transaction: SessionTransaction,
  session: TelegramSession,
  callbackData: string,
  parameter: string,
  nextState: string,
  question: string,
) {
  const value = parseYesNo(callbackData)
  if (value === null) return staleResult()
  session.data.parameters[parameter] = value
  return saveAndReply(transaction, session, nextState, {
    text: question,
    replyMarkup: inline(YES_NO),
  })
}

async function setBooleanAndAskReport(
  transaction: SessionTransaction,
  session: TelegramSession,
  callbackData: string,
  parameter: string,
) {
  const value = parseYesNo(callbackData)
  if (value === null) return staleResult()
  session.data.parameters[parameter] = value
  return askPhotoReport(transaction, session)
}

async function showReview(transaction: SessionTransaction, session: TelegramSession) {
  session.state = 'review'
  await transaction.saveSession(session)
  return {
    messages: [
      {
        text: buildSummary(session.data),
        replyMarkup: inline([
          [{ text: '✅ Отправить заявку', callback_data: `submit:${session.sessionId}` }],
          [{ text: 'Изменить', callback_data: 'edit' }],
        ]),
      },
    ],
  }
}

export function buildSummary(data: SessionData): string {
  if (!data.serviceType) return 'Заявка не заполнена.'
  const p = data.parameters
  const lines = ['Ваш заказ', '', SERVICE_LABELS[data.serviceType]]

  switch (data.serviceType) {
    case 'house_cleaning':
      lines.push(
        `Площадь: ${p.house_area} м²`,
        `Этажей: ${p.floors === 4 ? '4+' : p.floors}`,
        `Вид уборки: ${cleaningTierLabel(p.cleaning_tier)}`,
      )
      break
    case 'window_cleaning':
      lines.push(`Количество окон: ${p.windows_count}`, `Панорамные окна / сложное остекление: ${yesNo(p.panoramic_windows)}`)
      break
    case 'furniture_cleaning':
      lines.push(`Что почистить: ${p.furniture_description}`, `Фото мебели: ${photoCount(p)}`)
      break
    case 'lawn_mowing':
      lines.push(`Площадь: ${p.lawn_area} м²`, `Сбор травы: ${yesNo(p.collect_grass)}`, `Вывоз травы: ${yesNo(p.remove_grass)}`)
      break
    case 'snow_removal':
      lines.push(`Зона: ${p.snow_zone}`)
      if (p.snow_zone_description) lines.push(`Описание: ${p.snow_zone_description}`)
      lines.push(`Площадь: ${p.snow_area} м²`, `Вывоз снега: ${yesNo(p.remove_snow)}`, `Срочно: ${yesNo(p.urgent)}`)
      break
    case 'leaf_removal':
      lines.push(`Площадь: ${p.plot_area} м²`, `Сбор в мешки: ${yesNo(p.bag_leaves)}`, `Вывоз листьев: ${yesNo(p.remove_leaves)}`)
      break
    case 'pool_care':
      lines.push(`Тип обслуживания: ${poolTypeLabel(p.pool_type)}`, `Описание: ${p.pool_description}`, `Фото бассейна: ${photoCount(p)}`)
      break
    case 'handyman':
      lines.push(`Часов: ${p.handyman_hours}`)
      break
    case 'house_prep':
      break
    case 'other':
      lines.push(`Описание: ${p.other_description}`, `Фото задачи: ${photoCount(p)}`)
      break
  }

  lines.push(`Фотоотчёт: ${data.photoReportEnabled ? 'Да' : 'Нет'}`)
  lines.push('', `Дата: ${formatRussianDate(data.requestedDate)}`, `Время: ${data.requestedTime}`)
  lines.push('', `Адрес: ${data.address}`, `Клиент: ${data.clientName}`, `Телефон: ${data.clientPhone}`)
  if (data.comment) lines.push('', `Комментарий: ${data.comment}`)
  lines.push('', formatPriceDisplay(data.serviceType, data.parameters, calculatePrice(data.serviceType, data.parameters).amount))
  return lines.join('\n')
}

export function buildAdminOrderText(order: CreatedOrder): string {
  const lines = [
    `🧹 Новая заявка ${order.number}`,
    '',
    `Услуга: ${SERVICE_LABELS[order.serviceType]}`,
    '',
    `Клиент: ${order.clientName}`,
    `Телефон: ${order.clientPhone}`,
    `Адрес: ${order.address}`,
    '',
    `Дата: ${formatRussianDate(order.requestedDate)}`,
    `Время: ${order.requestedTime}`,
    '',
    `Фотоотчёт: ${order.photoReportEnabled ? 'Да' : 'Нет'}`,
    '',
    ...formatServiceParameters(order.serviceType, order.parameters),
  ]
  if (order.comment) lines.push('', `Комментарий: ${order.comment}`)
  lines.push('', formatPriceDisplay(order.serviceType, order.parameters, order.totalPrice))
  return lines.join('\n')
}

export function formatServiceParameters(
  serviceType: ServiceType,
  parameters: SessionData['parameters'],
): string[] {
  const p = parameters
  switch (serviceType) {
    case 'house_cleaning':
      return [
        `Площадь: ${p.house_area} м²`,
        `Этажей: ${p.floors === 4 ? '4+' : p.floors}`,
        `Вид уборки: ${cleaningTierLabel(p.cleaning_tier)}`,
      ]
    case 'window_cleaning':
      return [`Количество окон: ${p.windows_count}`, `Панорамные окна / сложное остекление: ${yesNo(p.panoramic_windows)}`]
    case 'furniture_cleaning':
      return [`Что почистить: ${p.furniture_description}`, `Фото мебели: ${photoCount(p)}`]
    case 'lawn_mowing':
      return [`Площадь: ${p.lawn_area} м²`, `Сбор травы: ${yesNo(p.collect_grass)}`, `Вывоз травы: ${yesNo(p.remove_grass)}`]
    case 'snow_removal': {
      const lines = [`Зона: ${p.snow_zone}`]
      if (p.snow_zone_description) lines.push(`Описание: ${p.snow_zone_description}`)
      lines.push(`Площадь: ${p.snow_area} м²`, `Вывоз снега: ${yesNo(p.remove_snow)}`, `Срочно: ${yesNo(p.urgent)}`)
      return lines
    }
    case 'leaf_removal':
      return [`Площадь: ${p.plot_area} м²`, `Сбор в мешки: ${yesNo(p.bag_leaves)}`, `Вывоз листьев: ${yesNo(p.remove_leaves)}`]
    case 'pool_care':
      return [`Тип обслуживания: ${poolTypeLabel(p.pool_type)}`, `Описание: ${p.pool_description}`, `Фото бассейна: ${photoCount(p)}`]
    case 'handyman':
      return [`Часов: ${p.handyman_hours}`]
    case 'house_prep':
      return []
    case 'other':
      return [`Описание: ${p.other_description}`, `Фото задачи: ${photoCount(p)}`]
  }
}

const CLEANING_TIER_LABELS: Record<string, string> = {
  supporting: 'Поддерживающая уборка',
  general: 'Генеральная уборка',
  post_renovation: 'Уборка после ремонта',
}

function cleaningTierLabel(value: unknown): string {
  return (typeof value === 'string' && CLEANING_TIER_LABELS[value]) || 'Не указан'
}

const POOL_TYPE_LABELS: Record<string, string> = {
  one_time: 'Разовый сервис',
  regular: 'Регулярное обслуживание',
  winterization: 'Консервация',
  de_winterization: 'Расконсервация',
}

function poolTypeLabel(value: unknown): string {
  return (typeof value === 'string' && POOL_TYPE_LABELS[value]) || 'Не указан'
}


function photoCount(parameters: SessionData['parameters']): string {
  const photos = parameters.telegram_photo_file_ids
  return Array.isArray(photos) ? String(photos.length) : 'Нет'
}

function yesNo(value: unknown): string {
  return value ? 'Да' : 'Нет'
}

function toNewOrder(session: TelegramSession): NewOrder | null {
  const data = session.data
  if (
    !data.serviceType ||
    !data.clientName ||
    !data.clientPhone ||
    !data.address ||
    !data.requestedDate ||
    !data.requestedTime ||
    data.photoReportEnabled === undefined
  ) {
    return null
  }
  return {
    sourceSessionId: session.sessionId,
    telegramChatId: session.chatId,
    telegramUsername: data.telegramUsername,
    serviceType: data.serviceType,
    clientName: data.clientName,
    clientPhone: data.clientPhone,
    address: data.address,
    requestedDate: data.requestedDate,
    requestedTime: data.requestedTime,
    photoReportEnabled: data.photoReportEnabled,
    parameters: data.parameters,
    comment: data.comment,
    totalPrice: calculatePrice(data.serviceType, data.parameters).amount,
    // Tentative: re-checked against the partner's active status inside createOrder(),
    // right before the INSERT, in the same transaction. Never trust session data alone.
    referralPartnerId: data.referralPartnerId ?? null,
    referralSource: data.referralPartnerId ? 'telegram' : null,
  }
}

async function saveAndReply(
  transaction: SessionTransaction,
  session: TelegramSession,
  state: string,
  message: OutgoingMessage,
): Promise<TransitionResult> {
  session.state = state
  await transaction.saveSession(session)
  return { messages: [message] }
}

function inline(inline_keyboard: InlineButton[][]): ReplyMarkup {
  return { inline_keyboard }
}

function invalid(text: string): TransitionResult {
  return { messages: [{ text }] }
}

function staleResult(): TransitionResult {
  return { messages: [{ text: 'Этот ответ уже не актуален. Отправьте /start, чтобы начать заново.' }] }
}

function restartResult(): TransitionResult {
  return { messages: [{ text: 'Отправьте /start, чтобы оформить заявку.' }] }
}

function parseYesNo(value: string): boolean | null {
  if (value === 'yes') return true
  if (value === 'no') return false
  return null
}

function parseIntegerCallback(value: string, prefix: string, min: number, max: number): number | null {
  if (!value.startsWith(prefix)) return null
  return parseInteger(value.slice(prefix.length), min, max)
}

function parseInteger(value: string | undefined, min: number, max: number): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function validText(value: string | undefined, min: number, max: number): boolean {
  return value !== undefined && value.length >= min && value.length <= max
}

function moscowToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function parseRussianDate(value: string | undefined): string | null {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

function formatRussianDate(isoDate?: string): string {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}

// Real Telegram username rules: 5-32 chars, letters/digits/underscores, must start with a letter.
const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/

/** Returns a validated Telegram username (no leading @) for /start partner's contact button, or null. */
function getTelegramAdminUsername(): string | null {
  const configured = process.env.TELEGRAM_ADMIN_USERNAME?.trim() ?? ''
  return TELEGRAM_USERNAME_PATTERN.test(configured) ? configured : null
}

function referralsMenuKeyboard(): ReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: '📋 Список рефералов', callback_data: 'rf:list' }],
      [{ text: '➕ Создать реферала', callback_data: 'rf:new' }],
    ],
  }
}

function referralLinksText(partner: { code: string; accessToken: string }): string[] {
  return [
    'Для клиентов через Telegram:',
    `${TELEGRAM_CONTACT_URL}?start=ref_${partner.code}`,
    '',
    'Для клиентов через сайт:',
    domTrackUrl(`/r/${partner.code}`),
    '',
    'Статистика партнёра:',
    domTrackUrl(`/partner/${partner.accessToken}`),
  ]
}

function referralPartnerCreatedText(partner: { name: string; code: string; accessToken: string }): string {
  return [`Партнёр: ${partner.name}`, '', ...referralLinksText(partner)].join('\n')
}

function referralPartnerListText(partners: ReferralPartnerStats[]): string {
  if (partners.length === 0) return 'Рефералов пока нет.'
  return partners
    .map((partner) => (
      `${partner.active ? '' : '🚫 '}${partner.name} — ${partner.ordersCount} зак., `
      + `комиссия ${formatRubles(partner.accruedCommission)}`
    ))
    .join('\n')
}

function referralPartnerDetailText(partner: ReferralPartnerAdminDetail): string {
  const lines = [
    `Партнёр: ${partner.name}${partner.active ? '' : ' (отключён)'}`,
    `Код: ${partner.code}`,
    `Комиссия: ${partner.commissionPercent}%`,
    '',
    `Заказов: ${partner.ordersCount}`,
    `Сумма всех заказов: ${formatRubles(partner.totalAmount)}`,
    `Сумма выполненных: ${formatRubles(partner.completedAmount)}`,
    `Комиссия с выполненных: ${formatRubles(partner.accruedCommission)}`,
    '',
    ...referralLinksText(partner),
  ]
  if (partner.orders.length > 0) {
    lines.push('', 'Последние заказы:')
    for (const order of partner.orders.slice(0, 15)) {
      lines.push(`${order.number} · ${order.totalPrice === null ? 'цена не подтверждена' : formatRubles(order.totalPrice)} · ${order.statusLabel}`)
    }
  }
  return lines.join('\n')
}
