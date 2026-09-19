'use server'

import { advanceWorkerOrder, type WorkerActionResult } from '@/lib/worker-orders'
import {
  updateOrderChecklistItem,
  type UpdateChecklistItemResult,
} from '@/lib/order-checklist'

export async function markOnTheWay(token: string): Promise<WorkerActionResult> {
  return advanceWorkerOrder(token, 'leave')
}

export async function startWork(token: string): Promise<WorkerActionResult> {
  return advanceWorkerOrder(token, 'start')
}

export async function completeWork(token: string): Promise<WorkerActionResult> {
  return advanceWorkerOrder(token, 'complete')
}

export async function setChecklistItemCompleted(
  token: string,
  itemId: string,
  completed: boolean,
): Promise<UpdateChecklistItemResult> {
  return updateOrderChecklistItem(token, itemId, completed)
}
