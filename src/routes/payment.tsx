import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import {
  dokuCredentialsFromEnv,
  syncOrderStatus,
  type SyncStatus,
} from '../lib/payment-sync'
import { requirePageAuth } from '../middleware/auth'
import {
  PaymentResultPage,
  type PaymentState,
} from '../views/payment'

export const paymentRoutes = new Hono<AppEnv>()

function stateFromStatus(status: SyncStatus): PaymentState {
  if (status === 'PAID') {
    return 'paid'
  }

  if (status === 'FAILED' || status === 'EXPIRED') {
    return 'failed'
  }

  return 'pending'
}

paymentRoutes.get('/payment/success', requirePageAuth, async (c) => {
  const user = c.get('user')
  const invoice = c.req.query('invoice') ?? c.req.query('invoice_number') ?? null
  const credentials = dokuCredentialsFromEnv(c.env)

  let state: PaymentState = 'pending'
  let message: string | null = null

  if (!invoice) {
    message = 'No invoice number was provided.'
  } else if (!credentials) {
    message =
      'Payment confirmation is not configured. Please contact support with your invoice number.'
  } else {
    const result = await syncOrderStatus(c.env.DB, credentials, invoice)

    if (result.order && result.order.userId !== user.id) {
      message = 'This invoice does not belong to your account.'
    } else if (result.status === 'NOT_FOUND') {
      message = 'We could not find this invoice.'
    } else {
      state = stateFromStatus(result.status)
      message = result.message
    }
  }

  return c.render(
    <PaymentResultPage
      state={state}
      invoice={invoice}
      user={user}
      message={message}
    />,
    { title: 'Payment status · CABE3' },
  )
})

paymentRoutes.get('/payment/failed', requirePageAuth, (c) => {
  const invoice = c.req.query('invoice') ?? c.req.query('invoice_number') ?? null

  return c.render(
    <PaymentResultPage
      state="failed"
      invoice={invoice}
      user={c.get('user')}
    />,
    { title: 'Payment not completed · CABE3' },
  )
})
