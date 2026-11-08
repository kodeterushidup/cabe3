import { DokuError, getDokuOrderStatus } from './doku'
import type { D1Database, Env } from './env'
import {
  findOrderByInvoice,
  type OrderRow,
  settlePaidOrder,
  updateOrderStatus,
} from './orders'

export interface DokuCredentials {
  clientId: string
  secretKey: string
  production: boolean
}

export type SyncStatus = 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'NOT_FOUND'

export interface SyncResult {
  status: SyncStatus
  order: OrderRow | null
  message: string | null
}

export function dokuCredentialsFromEnv(env: Env): DokuCredentials | null {
  if (!env.DOKU_CLIENT_ID || !env.DOKU_API_KEY) {
    return null
  }

  return {
    clientId: env.DOKU_CLIENT_ID,
    secretKey: env.DOKU_API_KEY,
    production: env.DOKU_IS_PRODUCTION === 'true',
  }
}

/**
 * Asks DOKU for the real transaction status and credits quota when the payment
 * succeeded. Used as a fallback for webhooks that cannot reach the app (for
 * example when running on localhost) and by the manual "check status" action.
 */
export async function syncOrderStatus(
  db: D1Database,
  credentials: DokuCredentials,
  invoiceNumber: string,
): Promise<SyncResult> {
  const order = await findOrderByInvoice(db, invoiceNumber)

  if (!order) {
    return { status: 'NOT_FOUND', order: null, message: 'Order not found.' }
  }

  if (order.status === 'PAID') {
    return { status: 'PAID', order, message: null }
  }

  if (order.status === 'FAILED' || order.status === 'EXPIRED') {
    return { status: order.status, order, message: null }
  }

  let remote

  try {
    remote = await getDokuOrderStatus({
      clientId: credentials.clientId,
      secretKey: credentials.secretKey,
      production: credentials.production,
      invoiceNumber,
    })
  } catch (error) {
    const message =
      error instanceof DokuError ? error.message : 'Could not reach DOKU.'

    console.error('DOKU status check failed', { invoiceNumber, message })

    return { status: 'PENDING', order, message }
  }

  if (remote.status === 'SUCCESS') {
    if (remote.amount !== null && remote.amount !== order.amount) {
      console.warn('DOKU amount mismatch on status check', {
        invoiceNumber,
        expected: order.amount,
        received: remote.amount,
      })

      return {
        status: 'PENDING',
        order,
        message: 'The paid amount does not match this order. Contact support.',
      }
    }

    const settled = await settlePaidOrder(db, invoiceNumber, order.userId)

    return {
      status: 'PAID',
      order: { ...order, status: 'PAID' },
      message: settled ? null : 'This payment was already credited.',
    }
  }

  if (remote.status === 'FAILED' || remote.status === 'EXPIRED') {
    await updateOrderStatus(db, invoiceNumber, remote.status)

    return {
      status: remote.status,
      order: { ...order, status: remote.status },
      message: null,
    }
  }

  return { status: 'PENDING', order, message: null }
}
