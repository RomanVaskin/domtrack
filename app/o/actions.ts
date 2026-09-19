'use server'

import { acceptClientOrder, type AcceptClientOrderResult } from '@/lib/client-orders'

export async function acceptWork(token: string): Promise<AcceptClientOrderResult> {
  return acceptClientOrder(token)
}
