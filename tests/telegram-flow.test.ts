import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { TelegramOrderFlow } from '../lib/telegram/flow.ts'
import type {
  AssignOrderResult,
  BotApi,
  ConfirmOrderResult,
  CreatedOrder,
  NewOrder,
  RejectOrderResult,
  ReplyMarkup,
  SessionStore,
  SessionTransaction,
  TelegramSession,
  TelegramUpdate,
} from '../lib/telegram/types.ts'

class MemoryStore implements SessionStore {
  sessions = new Map<string, TelegramSession>()
  orders: Array<NewOrder & CreatedOrder & {
    status: 'new' | 'confirmed' | 'assigned' | 'on_the_way' | 'in_progress' | 'completed' | 'accepted' | 'rejected'
    clientToken?: string
    workerToken?: string
    workerName?: string
  }> = []
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
          const created = {
            ...structuredClone(order),
            id: String(this.orders.length + 1),
            number: `DT-${String(this.orders.length + 1).padStart(6, '0')}`,
            status: 'new' as const,
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
  assert.match(review?.text ?? '', /Стоимость: после подтверждения/)
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

describe('Telegram order flow', () => {
  const scenarios: Array<{
    service: NewOrder['serviceType']
    parameters: NewOrder['parameters']
    answer: (h: ReturnType<typeof harness>) => Promise<void>
  }> = [
    {
      service: 'house_cleaning',
      parameters: { house_area: 120, floors: 2 },
      answer: async (h) => {
        await h.message('120')
        await h.callback('floors:2')
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
      },
      answer: async (h) => {
        await h.callback('snow:other')
        await h.message('Площадка у гаража')
        await h.message('90')
        await h.callback('yes')
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
      parameters: { pool_description: 'Открытый бассейн 8×4 м' },
      answer: async (h) => {
        await h.message('Открытый бассейн 8×4 м')
        await h.callback('photos:skip')
      },
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
      assert.match(notification?.text ?? '', /Стоимость: после подтверждения/)
      assert.deepEqual(
        notification?.replyMarkup?.inline_keyboard?.[0].map((button) => button.callback_data),
        ['a:c:1', 'a:r:1'],
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
})
