'use server'

import { advanceWorkerOrder, type WorkerActionResult } from '@/lib/worker-orders'

export async function markOnTheWay(token: string): Promise<WorkerActionResult> {
  return advanceWorkerOrder(token, 'leave')
}

export async function startWork(token: string): Promise<WorkerActionResult> {
  return advanceWorkerOrder(token, 'start')
}

export async function completeWork(token: string): Promise<WorkerActionResult> {
  return advanceWorkerOrder(token, 'complete')
}
