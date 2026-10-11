import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { TelegramOrderFlow } from '../lib/telegram/flow.ts'
import { computeCommission } from '../lib/referral-partners.ts'
import type {
  AssignOrderResult,
  BotApi,
  ConfirmOrderResult,
  CreatedOrder,
  NewOrder,
  ReferralOrderSummary,
  ReferralPartner,
  ReferralPartnerAdminDetail,
  ReferralPartnerStats,
  RejectOrderResult,
  ReplyMarkup,
  SessionStore,
  SessionTransaction,
  SetOrderPriceResult,
  TelegramSession,
  TelegramUpdate,
} from '../lib/telegram/types.ts'

type MemoryOrder = NewOrder & CreatedOrder & {
  status: 'new' | 'confirmed' | 'assigned' | 'on_the_way' | 'in_progress' | 'completed' | 'accepted' | 'rejected'
  clientToken?: string
  workerToken?: string
  workerName?: string
  createdAt: string
}

class MemoryStore implements SessionStore {
  sessions = new Map<string, TelegramSession>()
  orders: MemoryOrder[] = []
  referralPartners = new Map<string, ReferralPartner>()
  private referralSeq = 0
  private locks = new Map<string, Promise<void>>()
  private orderLocks = new Map<string, Promise<void>>()

  async withChatLock<T>(
    chatId: string,
    operation: (transaction: SessionTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(chatId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.locks.set(chatId, previous.then(() => current))
    await previous
    try {
      const transaction: SessionTransaction = {
        getSession: async () => this.sessions.get(chatId) ?? null,
        saveSession: async (session) => {
          this.sessions.set(chatId, structuredClone(session))
        },
        deleteSession: async () => {
          this.sessions.delete(chatId)
        },
        createOrder: async (order) => {
          const existing = this.orders.find(
            (item) => item.sourceSessionId === order.sourceSessionId,
          )
          if (existing) return existing
          // Mirrors postgres-store.ts: re-check the partner is still active right before
          // the insert, never trust what the session carried from /start alone.
          const partner = order.referralPartnerId ? this.referralPartners.get(order.referralPartnerId) : undefined
          const referralPartnerId = partner?.active ? partner.id : null
          const referralSource = referralPartnerId ? order.referralSource : null
          const created: MemoryOrder = {
            ...structuredClone(order),
            referralPartnerId,
            referralSource,
            id: String(this.orders.length + 1),
            number: `DT-${String(this.orders.length + 1).padStart(6, '0')}`,
            status: 'new' as const,
            createdAt: new Date().toISOString(),
          }
          this.orders.push(created)
          return created
        },
      }
      return await operation(transaction)
    } finally {
      release()
    }
  }

  async findOrderBySessionId(sessionId: string): Promise<CreatedOrder | null> {
    return this.orders.find((item) => item.sourceSessionId === sessionId) ?? null
  }

  async confirmOrder(orderId: string): Promise<ConfirmOrderResult> {
    return this.withOrderLock(orderId, async () => {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return { kind: 'not_found' }
      if (order.status === 'rejected') return { kind: 'rejected' }
      if (order.status === 'new') {
        order.status = 'confirmed'
        order.clientToken = `client${order.id}`.padEnd(32, 'c')
        order.workerToken = `worker${order.id}`.padEnd(32, 'w')
      }
      return {
        kind: 'confirmed',
        orderNumber: order.number,
        clientChatId: order.telegramChatId,
        clientToken: order.clientToken!,
        workerToken: order.workerToken!,
      }
    })
  }

  async rejectOrder(orderId: string): Promise<RejectOrderResult> {
    return this.withOrderLock(orderId, async () => {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return { kind: 'not_found' }
      if (order.status !== 'new' && order.status !== 'rejected') return { kind: 'confirmed' }
      order.status = 'rejected'
      return { kind: 'rejected', orderNumber: order.number, clientChatId: order.telegramChatId }
    })
  }

  async setOrderPrice(orderId: string, price: number): Promise<SetOrderPriceResult> {
    return this.withOrderLock(orderId, async () => {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return { kind: 'not_found' }
      order.totalPrice = price
      return { kind: 'set', orderNumber: order.number }
    })
  }

  async getActiveReferralPartnerByCode(code: string): Promise<{ id: string; code: string } | null> {
    for (const partner of this.referralPartners.values()) {
      if (partner.code === code && partner.active) return { id: partner.id, code: partner.code }
    }
    return null
  }

  async createReferralPartner(name: string): Promise<ReferralPartner> {
    this.referralSeq += 1
    const partner: ReferralPartner = {
      id: `partner-${this.referralSeq}`,
      name: name.trim(),
      code: `CODE${this.referralSeq}`,
      accessToken: `token-${this.referralSeq}`.padEnd(32, 'x'),
      commissionPercent: 10,
      active: true,
      createdAt: new Date().toISOString(),
    }
    this.referralPartners.set(partner.id, partner)
    return partner
  }

  async listReferralPartners(): Promise<ReferralPartnerStats[]> {
    return [...this.referralPartners.values()].map((partner) => this.statsFor(partner))
  }

  async getReferralPartnerAdminDetail(id: string): Promise<ReferralPartnerAdminDetail | null> {
    const partner = this.referralPartners.get(id)
    if (!partner) return null
    return { ...this.statsFor(partner), orders: this.ordersFor(partner), accessToken: partner.accessToken }
  }

  private ordersFor(partner: ReferralPartner): ReferralOrderSummary[] {
    return this.orders
      .filter((order) => order.referralPartnerId === partner.id)
      .map((order) => {
        const accruable = order.status === 'completed' || order.status === 'accepted'
        return {
          id: order.id,
          number: order.number,
          createdAt: order.createdAt,
          totalPrice: order.totalPrice,
          status: order.status,
          statusLabel: order.status,
          commissionState: !accruable ? 'pending' : order.totalPrice === null ? 'price_unconfirmed' : 'accrued',
          commission: accruable ? computeCommission(order.totalPrice, partner.commissionPercent) : 0,
        } satisfies ReferralOrderSummary
      })
  }

  private statsFor(partner: ReferralPartner): ReferralPartnerStats {
    const orders = this.ordersFor(partner)
    let totalAmount = 0
    let completedAmount = 0
    let accruedCommission = 0
    for (const order of orders) {
      if (order.totalPrice !== null) totalAmount += order.totalPrice
      if (order.commissionState === 'accrued') {
        completedAmount += order.totalPrice!
        accruedCommission += order.commission
      }
    }
    return {
      id: partner.id,
      name: partner.name,
      code: partner.code,
      active: partner.active,
      commissionPercent: partner.commissionPercent,
      ordersCount: orders.length,
      totalAmount,
      completedAmount,
      accruedCommission,
    }
  }

  async assignOrder(orderId: string): Promise<AssignOrderResult> {
    return this.withOrderLock(orderId, async () => {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return { kind: 'not_found' }
      if (order.status === 'rejected') return { kind: 'rejected' }
      if (order.status === 'new') return { kind: 'not_confirmed' }
      order.status = 'assigned'
      order.workerName ??= 'Исполнитель'
      return {
        kind: 'assigned',
        orderNumber: order.number,
        clientToken: order.clientToken!,
        workerToken: order.workerToken!,
        workerName: order.workerName,
      }
    })
  }

  private async withOrderLock<T>(orderId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.orderLocks.get(orderId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => { release = resolve })
    this.orderLocks.set(orderId, previous.then(() => current))
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

class FakeBot implements BotApi {
  messages: Array<{ chatId: string; text: string; replyMarkup?: ReplyMarkup }> = []
  edits: Array<{ chatId: string; messageId: number; text: string; replyMarkup?: ReplyMarkup }> = []
  answeredCallbacks: Array<{ id: string; text?: string }> = []
  failChatId?: string

  async sendMessage(chatId: string, text: string, replyMarkup?: ReplyMarkup) {
    if (chatId === this.failChatId) throw new Error('Telegram unavailable')
    this.messages.push({ chatId, text, replyMarkup })
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    this.answeredCallbacks.push({ id: callbackQueryId, text })
  }

  async editMessageText(chatId: string, messageId: number, text: string, replyMarkup?: ReplyMarkup) {
    if (chatId === this.failChatId) throw new Error('Telegram unavailable')
    this.edits.push({ chatId, messageId, text, replyMarkup })
  }
}

function harness() {
  const store = new MemoryStore()
  const bot = new FakeBot()
  const flow = new TelegramOrderFlow(store, bot, {
    now: () => new Date('2026-09-19T09:00:00Z'),
  })
  let callbackId = 0
  const chatId = '42'

  return {
    store,
    bot,
    flow,
    chatId,
    message: (text: string) =>
      flow.handleUpdate({
        message: { chat: { id: chatId }, from: { username: 'roman' }, text },
      }),
    contact: (phone: string) =>
      flow.handleUpdate({
        message: {
          chat: { id: chatId },
          from: { username: 'roman' },
          contact: { phone_number: phone, user_id: 42 },
        },
      }),
    photo: (fileId: string) =>
      flow.handleUpdate({
        message: {
          chat: { id: chatId },
          from: { username: 'roman' },
          photo: [{ file_id: fileId, width: 100, height: 100 }],
        },
      }),
    callback: (data: string) => {
      const update: TelegramUpdate = {
        callback_query: {
          id: `callback-${++callbackId}`,
          from: { username: 'roman' },
          data,
          message: { message_id: callbackId, chat: { id: chatId } },
        },
      }
      return flow.handleUpdate(update)
    },
  }
}

async function selectService(
  h: ReturnType<typeof harness>,
  service: NewOrder['serviceType'],
) {
  await h.message('/start')
  await h.callback('begin')
  await h.callback(`service:${service}`)
}

async function completeCommon(h: ReturnType<typeof harness>, useContact = false) {
  await h.callback('report:yes')
  await h.message('Иван')
  if (useContact) await h.contact('+7 999 123-45-67')
  else await h.message('+7 999 123-45-67')
  await h.message('Москва, Лесная улица, 1')
  await h.callback('date:tomorrow')
  await h.callback('time:12')
  await h.callback('comment:none')

  const session = h.store.sessions.get(h.chatId)
  assert.equal(session?.state, 'review')
  const review = h.bot.messages.at(-1)
  assert.match(
    review?.text ?? '',
    /Стоимость: \d|Предварительная стоимость: от \d|Стоимость будет подтверждена после уточнения объёма работ/,
  )
  const submitData = review?.replyMarkup?.inline_keyboard?.[0]?.[0]?.callback_data
  assert.ok(submitData)
  assert.ok(submitData.startsWith('submit:'))
  await h.callback(submitData)
  assert.equal(h.store.sessions.has(h.chatId), false)
  return h.store.orders.at(-1)!
}

async function createHouseOrder(h: ReturnType<typeof harness>) {
  await selectService(h, 'house_cleaning')
  await h.message('180')
  await h.callback('floors:2')
  await h.callback('tier:supporting')
  return completeCommon(h)
}

/**
 * Same as createHouseOrder, but assumes the session is already at 'awaiting_service' (e.g.
 * after a referral-carrying /start + "begin") instead of restarting the flow with a plain /start,
 * which would otherwise wipe out any referral attribution already captured on the session.
 */
async function createHouseOrderFromAwaitingService(h: ReturnType<typeof harness>) {
  await h.callback('service:house_cleaning')
  await h.message('180')
  await h.callback('floors:2')
  await h.callback('tier:supporting')
  return completeCommon(h)
}

function adminCallback(
  h: ReturnType<typeof harness>,
  data: string,
  chatId = '99',
  callbackId = `admin-${Math.random()}`,
) {
  return h.flow.handleUpdate({
    callback_query: {
      id: callbackId,
      from: { username: 'admin' },
      data,
      message: { message_id: 77, chat: { id: chatId } },
    },
  })
}

function adminMessage(h: ReturnType<typeof harness>, text: string, chatId = '99') {
  return h.flow.handleUpdate({
    message: { chat: { id: chatId }, from: { username: 'admin' }, text },
  })
}

describe('Telegram order flow', () => {
  const scenarios: Array<{
    service: NewOrder['serviceType']
    parameters: NewOrder['parameters']
    answer: (h: ReturnType<typeof harness>) => Promise<void>
  }> = [
    {
      service: 'house_cleaning',
      parameters: { house_area: 120, floors: 2, cleaning_tier: 'general' },
      answer: async (h) => {
        await h.message('120')
        await h.callback('floors:2')
        await h.callback('tier:general')
      },
    },
    {
      service: 'window_cleaning',
      parameters: { windows_count: 8, panoramic_windows: true },
      answer: async (h) => {
        await h.callback('windows:6plus')
        await h.message('8')
        await h.callback('yes')
      },
    },
    {
      service: 'furniture_cleaning',
      parameters: {
        furniture_description: 'Диван и два кресла',
        telegram_photo_file_ids: ['furniture-1', 'furniture-2'],
      },
      answer: async (h) => {
        await h.message('Диван и два кресла')
        await h.photo('furniture-1')
        await h.photo('furniture-2')
        await h.callback('photos:done')
      },
    },
    {
      service: 'lawn_mowing',
      parameters: { lawn_area: 600, collect_grass: true, remove_grass: false },
      answer: async (h) => {
        await h.message('600')
        await h.callback('yes')
        await h.callback('no')
      },
    },
    {
      service: 'snow_removal',
      parameters: {
        snow_zone: 'Другое',
        snow_zone_description: 'Площадка у гаража',
        snow_area: 90,
        remove_snow: true,
        urgent: false,
      },
      answer: async (h) => {
        await h.callback('snow:other')
        await h.message('Площадка у гаража')
        await h.message('90')
        await h.callback('yes')
        await h.callback('no')
      },
    },
    {
      service: 'leaf_removal',
      parameters: { plot_area: 1500, bag_leaves: false, remove_leaves: true },
      answer: async (h) => {
        await h.message('1500')
        await h.callback('no')
        await h.callback('yes')
      },
    },
    {
      service: 'pool_care',
      parameters: { pool_type: 'one_time', pool_description: 'Открытый бассейн 8×4 м' },
      answer: async (h) => {
        await h.callback('pool:one_time')
        await h.message('Открытый бассейн 8×4 м')
        await h.callback('photos:skip')
      },
    },
    {
      service: 'handyman',
      parameters: { handyman_hours: 3 },
      answer: async (h) => {
        await h.message('3')
      },
    },
    {
      service: 'house_prep',
      parameters: {},
      answer: async () => {},
    },
    {
      service: 'other',
      parameters: {
        other_description: 'Убрать ветки после шторма',
        telegram_photo_file_ids: ['task-1'],
      },
      answer: async (h) => {
        await h.message('Убрать ветки после шторма')
        await h.photo('task-1')
        await h.callback('photos:done')
      },
    },
  ]

  for (const scenario of scenarios) {
    test(`creates ${scenario.service} with only relevant parameters`, async () => {
      const h = harness()
      await selectService(h, scenario.service)
      await scenario.answer(h)
      const order = await completeCommon(
        h,
        scenario.service === 'furniture_cleaning',
      )

      assert.equal(order.serviceType, scenario.service)
      assert.deepEqual(order.parameters, scenario.parameters)
      assert.equal(order.photoReportEnabled, true)
      assert.equal(order.number, 'DT-000001')
      assert.match(h.bot.messages.at(-1)?.text ?? '', /Заявка DT-000001 принята/)
    })
  }

  test('rejects invalid numbers without advancing the state', async () => {
    const h = harness()
    await selectService(h, 'house_cleaning')
    await h.message('19')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'house_area')
    assert.match(h.bot.messages.at(-1)?.text ?? '', /20 до 2000/)
    await h.message('20.5')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'house_area')
    await h.message('20')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'house_floors')
  })

  test('validates a custom date and accepts a non-past date', async () => {
    const h = harness()
    await selectService(h, 'house_cleaning')
    await h.message('100')
    await h.callback('floors:1')
    await h.callback('tier:supporting')
    await h.callback('report:no')
    await h.message('Анна')
    await h.message('+79990000000')
    await h.message('Адрес')
    await h.callback('date:other')
    await h.message('31.02.2027')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'requested_date_custom')
    await h.message('18.09.2026')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'requested_date_custom')
    await h.message('19.09.2026')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'requested_time')
  })

  test('/start replaces an unfinished session', async () => {
    const h = harness()
    await selectService(h, 'lawn_mowing')
    await h.message('500')
    const oldSessionId = h.store.sessions.get(h.chatId)?.sessionId
    await h.message('/start')
    const session = h.store.sessions.get(h.chatId)
    assert.notEqual(session?.sessionId, oldSessionId)
    assert.equal(session?.state, 'awaiting_begin')
    assert.deepEqual(session?.data.parameters, {})
  })

  test('double submit creates exactly one order', async () => {
    const h = harness()
    await selectService(h, 'house_cleaning')
    await h.message('120')
    await h.callback('floors:2')
    await h.callback('tier:supporting')
    await h.callback('report:no')
    await h.message('Иван')
    await h.message('+79990000000')
    await h.message('Адрес')
    await h.callback('date:today')
    await h.callback('time:09')
    await h.callback('comment:none')
    const submitData = h.bot.messages.at(-1)?.replyMarkup?.inline_keyboard?.[0]?.[0]?.callback_data
    assert.ok(submitData)

    await Promise.all([h.callback(submitData), h.callback(submitData)])

    assert.equal(h.store.orders.length, 1)
    assert.equal(
      h.bot.messages.filter((message) => message.text.includes('DT-000001 принята')).length,
      2,
    )
  })

  test('unknown updates are ignored and a missing session asks for /start', async () => {
    const h = harness()
    await h.flow.handleUpdate({})
    assert.equal(h.bot.messages.length, 0)
    await h.message('Привет')
    assert.match(h.bot.messages.at(-1)?.text ?? '', /\/start/)
  })

  test('rejects an unknown service callback safely', async () => {
    const h = harness()
    await h.message('/start')
    await h.callback('begin')
    await h.callback('service:toString')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'awaiting_service')
    assert.match(h.bot.messages.at(-1)?.text ?? '', /не актуален/)
  })

  test('/myid returns only the Telegram chat id', async () => {
    const h = harness()
    await h.message('/myid')
    assert.equal(h.bot.messages.at(-1)?.text, 'Ваш Telegram chat_id: 42')
    assert.equal(h.store.sessions.size, 0)
  })

  test('a new order sends a complete admin notification with actions', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      const notification = h.bot.messages.find((message) => message.chatId === '99')
      assert.match(notification?.text ?? '', /🧹 Новая заявка DT-000001/)
      assert.match(notification?.text ?? '', /Услуга: Уборка дома/)
      assert.match(notification?.text ?? '', /Площадь: 180 м²/)
      assert.match(notification?.text ?? '', /Стоимость: 10 900 ₽/)
      assert.deepEqual(
        notification?.replyMarkup?.inline_keyboard?.[0].map((button) => button.callback_data),
        ['a:c:1', 'a:r:1', 'a:p:1'],
      )
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('a non-admin callback does not read or change the order', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      await adminCallback(h, 'a:c:1', '42')
      assert.equal(h.store.orders[0].status, 'new')
      assert.equal(h.bot.answeredCallbacks.at(-1)?.text, 'Недоступно.')
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('confirm is idempotent and parallel callbacks keep the same two tokens', async () => {
    const previousAdmin = process.env.TELEGRAM_ADMIN_CHAT_ID
    const previousBase = process.env.DOMTRACK_BASE_URL
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    process.env.DOMTRACK_BASE_URL = 'https://domtrack.ru'
    try {
      const h = harness()
      await createHouseOrder(h)
      await Promise.all([
        adminCallback(h, 'a:c:1', '99', 'confirm-1'),
        adminCallback(h, 'a:c:1', '99', 'confirm-2'),
      ])
      const order = h.store.orders[0]
      const tokens = [order.clientToken, order.workerToken]
      assert.equal(order.status, 'confirmed')
      assert.equal(order.clientToken?.length, 32)
      assert.equal(order.workerToken?.length, 32)
      assert.notEqual(order.clientToken, order.workerToken)
      await adminCallback(h, 'a:c:1', '99', 'confirm-3')
      assert.deepEqual([order.clientToken, order.workerToken], tokens)
      assert.match(h.bot.edits.at(-1)?.text ?? '', new RegExp(`/o/${order.clientToken}`))
      assert.match(h.bot.edits.at(-1)?.text ?? '', new RegExp(`/worker/${order.workerToken}`))
      assert.equal(
        h.bot.edits.at(-1)?.replyMarkup?.inline_keyboard?.[0]?.[0]?.callback_data,
        'a:a:1',
      )
      assert.ok(!h.bot.messages.find((message) => message.chatId === '42')?.text.includes('/worker/'))
    } finally {
      if (previousAdmin === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previousAdmin
      if (previousBase === undefined) delete process.env.DOMTRACK_BASE_URL
      else process.env.DOMTRACK_BASE_URL = previousBase
    }
  })

  test('admin assigns a confirmed order idempotently', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      await adminCallback(h, 'a:c:1', '99', 'confirm')
      await adminCallback(h, 'a:a:1', '99', 'assign-1')
      await adminCallback(h, 'a:a:1', '99', 'assign-2')
      assert.equal(h.store.orders[0].status, 'assigned')
      assert.equal(h.store.orders[0].workerName, 'Исполнитель')
      assert.equal(h.bot.answeredCallbacks.at(-1)?.text, 'Исполнитель назначен.')
      assert.match(h.bot.edits.at(-1)?.text ?? '', /исполнитель назначен/i)
      assert.deepEqual(h.bot.edits.at(-1)?.replyMarkup?.inline_keyboard, [])
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('reject is idempotent and rejected orders cannot be confirmed', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      await adminCallback(h, 'a:r:1', '99', 'reject-1')
      await adminCallback(h, 'a:r:1', '99', 'reject-2')
      assert.equal(h.store.orders[0].status, 'rejected')
      await adminCallback(h, 'a:c:1', '99', 'confirm-rejected')
      assert.equal(h.store.orders[0].status, 'rejected')
      assert.equal(h.bot.answeredCallbacks.at(-1)?.text, 'Заявка уже отклонена.')
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('a confirmed order cannot be rejected', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      await adminCallback(h, 'a:c:1', '99')
      await adminCallback(h, 'a:r:1', '99')
      assert.equal(h.store.orders[0].status, 'confirmed')
      assert.equal(h.bot.answeredCallbacks.at(-1)?.text, 'Заявка уже подтверждена.')
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('Telegram failure after confirm preserves the order and its tokens', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      h.bot.failChatId = '42'
      await adminCallback(h, 'a:c:1', '99', 'failure-1')
      const order = h.store.orders[0]
      const tokens = [order.clientToken, order.workerToken]
      assert.equal(order.status, 'confirmed')
      await adminCallback(h, 'a:c:1', '99', 'failure-2')
      assert.deepEqual([order.clientToken, order.workerToken], tokens)
      assert.equal(h.store.orders.length, 1)
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('auto-calculated price reaches the created order through the full flow', async () => {
    const h = harness()
    await createHouseOrder(h)
    // house_area 180, cleaning_tier "supporting" -> <=200 m2 tier -> 10900.
    assert.equal(h.store.orders[0].totalPrice, 10900)
  })

  test('a manual-pricing service creates an order with totalPrice = null', async () => {
    const h = harness()
    await selectService(h, 'window_cleaning')
    await h.callback('windows:3')
    await h.callback('no')
    const order = await completeCommon(h)
    assert.equal(order.totalPrice, null)
  })

  test('house_prep: the preliminary "from" price is never written into total_price', async () => {
    const h = harness()
    await selectService(h, 'house_prep')
    assert.match(
      h.bot.messages.at(-1)?.text ?? '',
      /Предварительная стоимость: от 9 900 ₽/,
    )
    const order = await completeCommon(h)
    assert.equal(order.serviceType, 'house_prep')
    assert.equal(order.totalPrice, null)
  })

  test('admin can set the price for a manual-pricing order', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await selectService(h, 'window_cleaning')
      await h.callback('windows:3')
      await h.callback('no')
      await completeCommon(h)
      assert.equal(h.store.orders[0].totalPrice, null)

      await adminCallback(h, 'a:p:1', '99')
      assert.equal(h.bot.messages.at(-1)?.text, 'Введите стоимость заказа в рублях.')
      await adminMessage(h, '7000')
      assert.equal(h.store.orders[0].totalPrice, 7000)
      assert.match(h.bot.messages.at(-1)?.text ?? '', /DT-000001 установлена: 7 000 ₽/)
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('admin can change an already auto-calculated price', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      assert.equal(h.store.orders[0].totalPrice, 10900)
      await adminCallback(h, 'a:p:1', '99')
      await adminMessage(h, '9500')
      assert.equal(h.store.orders[0].totalPrice, 9500)
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })

  test('admin price input rejects non-numeric input and keeps waiting for a valid one', async () => {
    const previous = process.env.TELEGRAM_ADMIN_CHAT_ID
    process.env.TELEGRAM_ADMIN_CHAT_ID = '99'
    try {
      const h = harness()
      await createHouseOrder(h)
      await adminCallback(h, 'a:p:1', '99')
      await adminMessage(h, 'не число')
      assert.equal(h.store.orders[0].totalPrice, 10900)
      assert.match(h.bot.messages.at(-1)?.text ?? '', /рублей, не меньше 0/)
      await adminMessage(h, '5000')
      assert.equal(h.store.orders[0].totalPrice, 5000)
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
      else process.env.TELEGRAM_ADMIN_CHAT_ID = previous
    }
  })
})

describe('Referral program', () => {
  async function withEnv<T>(vars: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
    const previous: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(vars)) {
      previous[key] = process.env[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    try {
      return await run()
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  }

  test('valid /start ref_CODE attributes the session to the active partner', async () => {
    const h = harness()
    const partner = await h.store.createReferralPartner('Садовый партнёр')
    await h.message(`/start ref_${partner.code}`)
    assert.equal(h.store.sessions.get(h.chatId)?.data.referralPartnerId, partner.id)
    assert.match(h.bot.messages.at(-1)?.text ?? '', /Добро пожаловать в DomTrack/)
  })

  test('an invalid/unknown referral code still starts a plain session', async () => {
    const h = harness()
    await h.message('/start ref_DOESNOTEXIST')
    assert.equal(h.store.sessions.get(h.chatId)?.data.referralPartnerId, undefined)
    assert.match(h.bot.messages.at(-1)?.text ?? '', /Добро пожаловать в DomTrack/)
  })

  test('a referred order writes referral_partner_id and referral_source="telegram"', async () => {
    const h = harness()
    const partner = await h.store.createReferralPartner('Реферал А')
    await h.message(`/start ref_${partner.code}`)
    await h.callback('begin')
    const order = await createHouseOrderFromAwaitingService(h)
    assert.equal(order.referralPartnerId, partner.id)
    assert.equal(order.referralSource, 'telegram')
  })

  test('a plain order (no referral code) is created with referral fields null', async () => {
    const h = harness()
    const order = await createHouseOrder(h)
    assert.equal(order.referralPartnerId, null)
    assert.equal(order.referralSource, null)
  })

  test('referral attribution survives the full real Telegram order-flow state machine', async () => {
    const h = harness()
    const partner = await h.store.createReferralPartner('Реферал Б')
    await h.message(`/start ref_${partner.code}`)
    await h.callback('begin')
    await h.callback('service:snow_removal')
    await h.callback('snow:parking')
    await h.message('80')
    await h.callback('yes')
    await h.callback('no')
    const order = await completeCommon(h)
    assert.equal(order.serviceType, 'snow_removal')
    assert.equal(order.referralPartnerId, partner.id)
    assert.equal(order.referralSource, 'telegram')
  })

  test('referral attribution survives review -> edit, which rebuilds session.data from scratch', async () => {
    const h = harness()
    const partner = await h.store.createReferralPartner('Реферал В')
    await h.message(`/start ref_${partner.code}`)
    await h.callback('begin')
    await h.callback('service:house_cleaning')
    await h.message('180')
    await h.callback('floors:2')
    await h.callback('tier:supporting')
    await h.callback('report:yes')
    await h.message('Иван')
    await h.message('+7 999 123-45-67')
    await h.message('Москва, Лесная улица, 1')
    await h.callback('date:tomorrow')
    await h.callback('time:12')
    await h.callback('comment:none')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'review')
    assert.equal(h.store.sessions.get(h.chatId)?.data.referralPartnerId, partner.id)

    await h.callback('edit')
    assert.equal(h.store.sessions.get(h.chatId)?.state, 'awaiting_service')
    assert.equal(h.store.sessions.get(h.chatId)?.data.referralPartnerId, partner.id)

    await h.callback('service:house_cleaning')
    await h.message('150')
    await h.callback('floors:1')
    await h.callback('tier:general')
    const order = await completeCommon(h)
    assert.equal(order.referralPartnerId, partner.id)
  })

  test('a partner disabled between /start and submit is never attributed', async () => {
    const h = harness()
    const partner = await h.store.createReferralPartner('Реферал Г')
    await h.message(`/start ref_${partner.code}`)
    await h.callback('begin')
    // Disabled mid-flow, after attribution was captured in the session but before submit.
    h.store.referralPartners.get(partner.id)!.active = false
    const order = await createHouseOrderFromAwaitingService(h)
    assert.equal(order.referralPartnerId, null)
    assert.equal(order.referralSource, null)
  })

  test('non-admin chat cannot run /referrals', async () => {
    await withEnv({ TELEGRAM_ADMIN_CHAT_ID: '99' }, async () => {
      const h = harness()
      await h.message('/referrals')
      assert.equal(h.bot.messages.filter((m) => /Рефералы/.test(m.text)).length, 0)
    })
  })

  test('admin can create a referral partner via /referrals -> Создать реферала', async () => {
    await withEnv({ TELEGRAM_ADMIN_CHAT_ID: '99' }, async () => {
      const h = harness()
      await adminMessage(h, '/referrals', '99')
      assert.match(h.bot.messages.at(-1)?.text ?? '', /Рефералы/)

      await adminCallback(h, 'rf:new', '99')
      assert.match(h.bot.messages.at(-1)?.text ?? '', /Введите имя/)

      await adminMessage(h, 'Иван Партнёров', '99')
      const created = h.bot.messages.at(-1)?.text ?? ''
      assert.match(created, /Партнёр: Иван Партнёров/)
      assert.match(created, /start=ref_/)
      assert.match(created, /\/r\//)
      assert.match(created, /\/partner\//)
      assert.equal(h.store.referralPartners.size, 1)
    })
  })

  test('admin can list referral partners', async () => {
    await withEnv({ TELEGRAM_ADMIN_CHAT_ID: '99' }, async () => {
      const h = harness()
      await h.store.createReferralPartner('Партнёр Один')
      await adminCallback(h, 'rf:list', '99')
      assert.match(h.bot.messages.at(-1)?.text ?? '', /Партнёр Один/)
    })
  })

  test('admin reopening a partner shows Telegram, website and private stats links', async () => {
    await withEnv({ TELEGRAM_ADMIN_CHAT_ID: '99' }, async () => {
      const h = harness()
      const partner = await h.store.createReferralPartner('Партнёр Детали')
      await adminCallback(h, `rf:open:${partner.id}`, '99')
      const text = h.bot.messages.at(-1)?.text ?? ''
      assert.match(text, new RegExp(`start=ref_${partner.code}`))
      assert.match(text, new RegExp(`/r/${partner.code}`))
      assert.match(text, new RegExp(`/partner/${partner.accessToken}`))
    })
  })

  test('/start partner with a valid admin username shows a contact button and notifies the admin', async () => {
    await withEnv({ TELEGRAM_ADMIN_CHAT_ID: '99', TELEGRAM_ADMIN_USERNAME: 'domtrack_admin' }, async () => {
      const h = harness()
      await h.message('/start partner')
      const reply = h.bot.messages.find((m) => m.chatId === h.chatId)
      assert.match(reply?.text ?? '', /стать партнёром/i)
      assert.equal(
        reply?.replyMarkup?.inline_keyboard?.[0]?.[0]?.url,
        'https://t.me/domtrack_admin',
      )
      const adminNotice = h.bot.messages.find((m) => m.chatId === '99')
      assert.match(adminNotice?.text ?? '', /Запрос на партнёрство/)
      assert.match(adminNotice?.text ?? '', /\/referrals/)
    })
  })

  test('/start partner with a missing/invalid admin username falls back with no button', async () => {
    await withEnv({ TELEGRAM_ADMIN_CHAT_ID: '99', TELEGRAM_ADMIN_USERNAME: undefined }, async () => {
      const h = harness()
      await h.message('/start partner')
      const reply = h.bot.messages.find((m) => m.chatId === h.chatId)
      assert.equal(reply?.replyMarkup, undefined)
      assert.match(reply?.text ?? '', /администратор уже получил уведомление/i)
    })
  })
})
