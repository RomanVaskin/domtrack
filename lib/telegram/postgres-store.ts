import { randomBytes } from 'node:crypto'
import postgres, { type Sql, type TransactionSql } from 'postgres'
import type {
  AssignOrderResult,
  ConfirmOrderResult,
  CreatedOrder,
  NewOrder,
  RejectOrderResult,
  SessionStore,
  SessionTransaction,
  TelegramSession,
} from './types'

let database: Sql | undefined

export function getDatabase(): Sql {
  if (database) return database

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured')
  }

  database = postgres(connectionString, {
    max: 5,
    prepare: false,
    ssl: process.env.DATABASE_SSL === 'false' ? false : 'require',
  })
  return database
}

function mapSession(row: Record<string, unknown>): TelegramSession {
  return {
    chatId: String(row.telegram_chat_id),
    sessionId: String(row.session_id),
    state: String(row.state),
    data: row.data as TelegramSession['data'],
  }
}

export class PostgresSessionStore implements SessionStore {
  async withChatLock<T>(
    chatId: string,
    operation: (transaction: SessionTransaction) => Promise<T>,
  ): Promise<T> {
    return getDatabase().begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${chatId}, 0))`

      const transaction: SessionTransaction = {
        getSession: async () => {
          const rows = await sql`
            SELECT telegram_chat_id, session_id, state, data
            FROM telegram_sessions
            WHERE telegram_chat_id = ${chatId}::bigint
            FOR UPDATE
          `
          return rows[0] ? mapSession(rows[0]) : null
        },
        saveSession: async (session) => {
          await sql`
            INSERT INTO telegram_sessions (
              telegram_chat_id, session_id, state, data, updated_at
            ) VALUES (
              ${session.chatId}::bigint,
              ${session.sessionId},
              ${session.state},
              ${sql.json(session.data as unknown as postgres.JSONValue)},
              now()
            )
            ON CONFLICT (telegram_chat_id) DO UPDATE SET
              session_id = EXCLUDED.session_id,
              state = EXCLUDED.state,
              data = EXCLUDED.data,
              updated_at = now()
          `
        },
        deleteSession: async () => {
          await sql`
            DELETE FROM telegram_sessions
            WHERE telegram_chat_id = ${chatId}::bigint
          `
        },
        createOrder: async (order) => createOrder(sql, order),
      }

      return operation(transaction)
    }) as Promise<T>
  }

  async findOrderBySessionId(sessionId: string): Promise<CreatedOrder | null> {
    const rows = await getDatabase()`
      SELECT id, number, telegram_chat_id, service_type, client_name,
             client_phone, address, requested_date, requested_time,
             photo_report_enabled, parameters, comment
      FROM orders
      WHERE source_session_id = ${sessionId}
    `
    return rows[0] ? mapCreatedOrder(rows[0]) : null
  }

  async confirmOrder(orderId: string): Promise<ConfirmOrderResult> {
    if (!/^\d+$/.test(orderId)) return { kind: 'not_found' }
    try {
      return await getDatabase().begin(async (sql) => {
        const rows = await sql`
          SELECT id, number, telegram_chat_id, status, client_token, worker_token
          FROM orders
          WHERE id = ${orderId}::bigint
          FOR UPDATE
        `
        const order = rows[0]
        if (!order) return { kind: 'not_found' } as const
        if (order.status === 'rejected') return { kind: 'rejected' } as const
        if (['confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed'].includes(String(order.status))) {
          if (!order.client_token || !order.worker_token) return { kind: 'error' } as const
          return confirmedResult(order)
        }
        if (order.status !== 'new') return { kind: 'error' } as const

        const clientToken = randomBytes(24).toString('base64url')
        const workerToken = randomBytes(24).toString('base64url')
        const updated = await sql`
          UPDATE orders
          SET status = 'confirmed',
              client_token = ${clientToken},
              worker_token = ${workerToken},
              confirmed_at = now()
          WHERE id = ${orderId}::bigint
          RETURNING number, telegram_chat_id, client_token, worker_token
        `
        return confirmedResult(updated[0])
      }) as ConfirmOrderResult
    } catch {
      return { kind: 'error' }
    }
  }

  async rejectOrder(orderId: string): Promise<RejectOrderResult> {
    if (!/^\d+$/.test(orderId)) return { kind: 'not_found' }
    try {
      return await getDatabase().begin(async (sql) => {
        const rows = await sql`
          SELECT id, number, telegram_chat_id, status
          FROM orders
          WHERE id = ${orderId}::bigint
          FOR UPDATE
        `
        const order = rows[0]
        if (!order) return { kind: 'not_found' } as const
        if (['confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed'].includes(String(order.status))) {
          return { kind: 'confirmed' } as const
        }
        if (order.status !== 'new' && order.status !== 'rejected') return { kind: 'error' } as const

        if (order.status === 'new') {
          await sql`
            UPDATE orders
            SET status = 'rejected', rejected_at = now()
            WHERE id = ${orderId}::bigint
          `
        }
        return {
          kind: 'rejected',
          orderNumber: String(order.number),
          clientChatId: String(order.telegram_chat_id),
        } as const
      }) as RejectOrderResult
    } catch {
      return { kind: 'error' }
    }
  }

  async assignOrder(orderId: string): Promise<AssignOrderResult> {
    if (!/^\d+$/.test(orderId)) return { kind: 'not_found' }
    try {
      return await getDatabase().begin(async (sql) => {
        const rows = await sql`
          SELECT id, number, status, client_token, worker_token, worker_name
          FROM orders
          WHERE id = ${orderId}::bigint
          FOR UPDATE
        `
        const order = rows[0]
        if (!order) return { kind: 'not_found' } as const
        if (order.status === 'rejected') return { kind: 'rejected' } as const
        if (['assigned', 'on_the_way', 'in_progress', 'completed'].includes(String(order.status))) {
          return assignedResult(order)
        }
        if (order.status !== 'confirmed') return { kind: 'not_confirmed' } as const
        if (!order.client_token || !order.worker_token) return { kind: 'error' } as const

        const updated = await sql`
          UPDATE orders
          SET status = 'assigned',
              worker_name = COALESCE(worker_name, 'Исполнитель'),
              assigned_at = COALESCE(assigned_at, now())
          WHERE id = ${orderId}::bigint AND status = 'confirmed'
          RETURNING number, client_token, worker_token, worker_name
        `
        if (!updated[0]) return { kind: 'error' } as const
        return assignedResult(updated[0])
      }) as AssignOrderResult
    } catch {
      return { kind: 'error' }
    }
  }
}

async function createOrder(sql: TransactionSql, order: NewOrder): Promise<CreatedOrder> {
  const rows = await sql`
    INSERT INTO orders (
      telegram_chat_id,
      telegram_username,
      service_type,
      client_name,
      client_phone,
      address,
      requested_date,
      requested_time,
      photo_report_enabled,
      parameters,
      comment,
      status,
      source_session_id
    ) VALUES (
      ${order.telegramChatId}::bigint,
      ${order.telegramUsername ?? null},
      ${order.serviceType},
      ${order.clientName},
      ${order.clientPhone},
      ${order.address},
      ${order.requestedDate}::date,
      ${order.requestedTime},
      ${order.photoReportEnabled},
      ${sql.json(order.parameters as postgres.JSONValue)},
      ${order.comment ?? null},
      'new',
      ${order.sourceSessionId}
    )
    ON CONFLICT (source_session_id) DO UPDATE SET
      source_session_id = EXCLUDED.source_session_id
    RETURNING id, number, telegram_chat_id, service_type, client_name,
              client_phone, address, requested_date, requested_time,
              photo_report_enabled, parameters, comment
  `
  return mapCreatedOrder(rows[0])
}

function mapCreatedOrder(row: Record<string, unknown>): CreatedOrder {
  return {
    id: String(row.id),
    number: String(row.number),
    telegramChatId: String(row.telegram_chat_id),
    serviceType: String(row.service_type) as CreatedOrder['serviceType'],
    clientName: String(row.client_name),
    clientPhone: String(row.client_phone),
    address: String(row.address),
    requestedDate: String(row.requested_date),
    requestedTime: String(row.requested_time),
    photoReportEnabled: Boolean(row.photo_report_enabled),
    parameters: row.parameters as CreatedOrder['parameters'],
    ...(row.comment ? { comment: String(row.comment) } : {}),
  }
}

function confirmedResult(row: Record<string, unknown>): Extract<ConfirmOrderResult, { kind: 'confirmed' }> {
  return {
    kind: 'confirmed',
    orderNumber: String(row.number),
    clientChatId: String(row.telegram_chat_id),
    clientToken: String(row.client_token),
    workerToken: String(row.worker_token),
  }
}

function assignedResult(row: Record<string, unknown>): Extract<AssignOrderResult, { kind: 'assigned' }> {
  return {
    kind: 'assigned',
    orderNumber: String(row.number),
    clientToken: String(row.client_token),
    workerToken: String(row.worker_token),
    workerName: String(row.worker_name),
  }
}
