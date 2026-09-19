import postgres, { type Sql, type TransactionSql } from 'postgres'
import type {
  CreatedOrder,
  NewOrder,
  SessionStore,
  SessionTransaction,
  TelegramSession,
} from './types'

let database: Sql | undefined

function getDatabase(): Sql {
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
      SELECT id, number
      FROM orders
      WHERE source_session_id = ${sessionId}
    `
    return rows[0]
      ? { id: String(rows[0].id), number: String(rows[0].number) }
      : null
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
    RETURNING id, number
  `
  return { id: String(rows[0].id), number: String(rows[0].number) }
}
