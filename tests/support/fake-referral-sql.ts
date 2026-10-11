import type { Sql } from 'postgres'

export interface FakePartnerRow {
  id: string
  name: string
  code: string
  access_token: string
  commission_percent: number
  active: boolean
  created_at: Date
}

export interface FakeOrderRow {
  id: string
  number: string
  created_at: Date
  total_price: number | null
  status: string
  referral_partner_id: string
  [extraColumn: string]: unknown
}

// A minimal fake postgres.js "sql" tag for lib/referral-partners.ts's own tests. It recognizes
// the handful of literal queries that module runs (matched by a stable, distinguishing
// substring copied from the real query text) and answers from in-memory arrays, so the data
// layer's actual SQL-adjacent logic (active-only filtering, column shape, etc.) is exercised
// without a real database connection.
export function createFakeReferralSql(
  { partners = [], orders = [] }: { partners?: FakePartnerRow[]; orders?: FakeOrderRow[] } = {},
): Sql {
  let nextPartnerId = partners.length + 1

  async function sql(strings: readonly string[], ...values: unknown[]): Promise<unknown[]> {
    const text = strings.join('?')

    if (text.includes('INSERT INTO referral_partners')) {
      const [name, code, accessToken] = values as [string, string, string]
      if (partners.some((p) => p.code === code || p.access_token === accessToken)) {
        const error: Error & { code?: string } = new Error('duplicate key value violates unique constraint')
        error.code = '23505'
        throw error
      }
      const row: FakePartnerRow = {
        id: String(nextPartnerId++),
        name,
        code,
        access_token: accessToken,
        commission_percent: 10,
        active: true,
        created_at: new Date(),
      }
      partners.push(row)
      return [row]
    }

    if (text.includes('FROM orders')) {
      const [partnerId] = values as [string]
      return orders
        .filter((order) => order.referral_partner_id === partnerId)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    }

    if (text.includes('WHERE code =')) {
      const [code] = values as [string]
      const match = partners.find((p) => p.code === code && p.active === true)
      return match ? [{ id: match.id, code: match.code }] : []
    }

    if (text.includes('WHERE access_token =')) {
      const [token] = values as [string]
      const match = partners.find((p) => p.access_token === token)
      return match
        ? [{ id: match.id, name: match.name, code: match.code, active: match.active, commission_percent: match.commission_percent }]
        : []
    }

    if (text.includes('access_token') && text.includes('WHERE id =')) {
      const [id] = values as [string]
      const match = partners.find((p) => p.id === id)
      return match ? [match] : []
    }

    if (text.includes('WHERE id =')) {
      const [id] = values as [string]
      const match = partners.find((p) => p.id === id && p.active === true)
      return match ? [{ id: match.id }] : []
    }

    if (text.includes('ORDER BY created_at DESC')) {
      return [...partners].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    }

    throw new Error(`createFakeReferralSql: unrecognized query: ${text}`)
  }

  return sql as unknown as Sql
}
