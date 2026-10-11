import { randomBytes } from 'node:crypto'
import type { Sql, TransactionSql } from 'postgres'
import { getDatabase } from './telegram/postgres-store.ts'
import type {
  ReferralOrderSummary,
  ReferralPartner,
  ReferralPartnerAdminDetail,
  ReferralPartnerDetail,
  ReferralPartnerStats,
} from './telegram/types.ts'

// Excludes visually ambiguous characters (0/O, 1/I) so a partner can read the code aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 7
const TOKEN_BYTES = 24
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9]{4,16}$/

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return code
}

function randomAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error
      && (error as { code?: unknown }).code === '23505',
  )
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  assigned: 'Назначен исполнитель',
  on_the_way: 'Исполнитель в пути',
  in_progress: 'В работе',
  completed: 'Выполнен',
  accepted: 'Принят клиентом',
  rejected: 'Отклонён',
}

/** Commission source of truth: the order itself has reached a finished status. */
function isAccruable(status: string): boolean {
  return status === 'completed' || status === 'accepted'
}

export function computeCommission(totalPrice: number | null, commissionPercent: number): number {
  if (totalPrice === null) return 0
  return Math.round((totalPrice * commissionPercent) / 100)
}

function commissionState(status: string, totalPrice: number | null): ReferralOrderSummary['commissionState'] {
  if (!isAccruable(status)) return 'pending'
  return totalPrice === null ? 'price_unconfirmed' : 'accrued'
}

function mapPartner(row: Record<string, unknown>): ReferralPartner {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    accessToken: String(row.access_token),
    commissionPercent: Number(row.commission_percent),
    active: Boolean(row.active),
    createdAt: (row.created_at as Date).toISOString(),
  }
}

/** Creates a referral partner, retrying on a code/access_token unique-constraint collision. */
export async function createReferralPartner(
  sql: TransactionSql | Sql,
  name: string,
): Promise<ReferralPartner> {
  const trimmedName = name.trim()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode()
    const accessToken = randomAccessToken()
    try {
      const rows = await sql`
        INSERT INTO referral_partners (name, code, access_token)
        VALUES (${trimmedName}, ${code}, ${accessToken})
        RETURNING id, name, code, access_token, commission_percent, active, created_at
      `
      return mapPartner(rows[0])
    } catch (error) {
      if (isUniqueViolation(error)) continue
      throw error
    }
  }
  throw new Error('Failed to generate a unique referral code')
}

/** Public attribution lookup used by /start ref_CODE and /r/[code] — only an active partner matches. */
export async function getActiveReferralPartnerByCode(
  code: string,
  sql: Sql = getDatabase(),
): Promise<{ id: string; code: string } | null> {
  if (typeof code !== 'string' || !REFERRAL_CODE_PATTERN.test(code)) return null
  const rows = await sql`
    SELECT id, code FROM referral_partners WHERE code = ${code} AND active = true
  `
  return rows[0] ? { id: String(rows[0].id), code: String(rows[0].code) } : null
}

/**
 * Re-checked as close to the order INSERT as possible, inside the same transaction, so a
 * partner disabled between /start and submit is never attributed. Never trust session data alone.
 */
export async function getActiveReferralPartnerId(
  sql: TransactionSql,
  partnerId: string,
): Promise<string | null> {
  if (typeof partnerId !== 'string' || !UUID_PATTERN.test(partnerId)) return null
  const rows = await sql`
    SELECT id FROM referral_partners WHERE id = ${partnerId} AND active = true
  `
  return rows[0] ? String(rows[0].id) : null
}

interface PartnerRow {
  id: string
  name: string
  code: string
  active: boolean
  commission_percent: number
}

interface OrderStatsRow {
  id: string
  number: string
  created_at: Date
  total_price: number | null
  status: string
}

async function ordersForPartner(sql: Sql, partnerId: string): Promise<OrderStatsRow[]> {
  const rows = await sql`
    SELECT id, number, created_at, total_price, status
    FROM orders
    WHERE referral_partner_id = ${partnerId}
    ORDER BY created_at DESC
  `
  return rows as unknown as OrderStatsRow[]
}

function toOrderSummary(row: OrderStatsRow, commissionPercent: number): ReferralOrderSummary {
  return {
    id: String(row.id),
    number: String(row.number),
    createdAt: row.created_at.toISOString(),
    totalPrice: row.total_price === null ? null : Number(row.total_price),
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status] ?? row.status,
    commissionState: commissionState(row.status, row.total_price),
    commission: isAccruable(row.status) ? computeCommission(row.total_price, commissionPercent) : 0,
  }
}

function aggregateStats(partner: PartnerRow, orders: OrderStatsRow[]): ReferralPartnerStats {
  let totalAmount = 0
  let completedAmount = 0
  let accruedCommission = 0
  for (const order of orders) {
    if (order.total_price !== null) totalAmount += Number(order.total_price)
    if (isAccruable(order.status) && order.total_price !== null) {
      completedAmount += Number(order.total_price)
      accruedCommission += computeCommission(order.total_price, partner.commission_percent)
    }
  }
  return {
    id: String(partner.id),
    name: partner.name,
    code: partner.code,
    active: partner.active,
    commissionPercent: Number(partner.commission_percent),
    ordersCount: orders.length,
    totalAmount,
    completedAmount,
    accruedCommission,
  }
}

export async function listReferralPartners(sql: Sql = getDatabase()): Promise<ReferralPartnerStats[]> {
  const partners = await sql`
    SELECT id, name, code, active, commission_percent FROM referral_partners ORDER BY created_at DESC
  `
  const stats: ReferralPartnerStats[] = []
  for (const partner of partners as unknown as PartnerRow[]) {
    stats.push(aggregateStats(partner, await ordersForPartner(sql, partner.id)))
  }
  return stats
}

async function detailById(sql: Sql, id: string): Promise<ReferralPartnerDetail & { accessToken: string } | null> {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return null
  const rows = await sql`
    SELECT id, name, code, access_token, active, commission_percent
    FROM referral_partners WHERE id = ${id}
  `
  const partner = rows[0]
  if (!partner) return null
  const orders = await ordersForPartner(sql, String(partner.id))
  const stats = aggregateStats(
    { id: partner.id, name: partner.name, code: partner.code, active: partner.active, commission_percent: partner.commission_percent },
    orders,
  )
  return {
    ...stats,
    orders: orders.map((row) => toOrderSummary(row, Number(partner.commission_percent))),
    accessToken: String(partner.access_token),
  }
}

/**
 * Admin-only lookup: the one place (besides creation) allowed to read back the access token,
 * so the bot's "open a referral partner" view can re-show the private stats URL. Never used
 * by the public partner page.
 */
export async function getReferralPartnerAdminDetailById(
  id: string,
  sql: Sql = getDatabase(),
): Promise<ReferralPartnerAdminDetail | null> {
  return detailById(sql, id)
}

/**
 * Public partner page lookup: resolved only by the long random access token, never by the
 * short public code. Never selects client PII and never returns the access token.
 */
export async function getReferralPartnerByAccessToken(
  token: string,
  sql: Sql = getDatabase(),
): Promise<ReferralPartnerDetail | null> {
  if (typeof token !== 'string' || !ACCESS_TOKEN_PATTERN.test(token)) return null
  const rows = await sql`
    SELECT id, name, code, active, commission_percent
    FROM referral_partners WHERE access_token = ${token}
  `
  const partner = rows[0]
  if (!partner) return null
  const orders = await ordersForPartner(sql, String(partner.id))
  const stats = aggregateStats(
    { id: partner.id, name: partner.name, code: partner.code, active: partner.active, commission_percent: partner.commission_percent },
    orders,
  )
  return { ...stats, orders: orders.map((row) => toOrderSummary(row, Number(partner.commission_percent))) }
}
