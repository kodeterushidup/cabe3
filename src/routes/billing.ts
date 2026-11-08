import { Hono } from 'hono'
import {
  createDokuCheckout,
  type DokuNotification,
  verifyDokuSignature,
} from '../lib/doku'
import type { AppEnv } from '../lib/env'
import {
  findOrderByInvoice,
  settlePaidOrder,
  updateOrderStatus,
} from '../lib/orders'
import { QUOTA_PACK_PRICE, QUOTA_PACK_SIZE } from '../lib/quota'
import {
  dokuCredentialsFromEnv,
  syncOrderStatus,
} from '../lib/payment-sync'
import { requirePageAuth } from '../middleware/auth'

export const billingRoutes = new Hono<AppEnv>()

billingRoutes.post('/billing/checkout', requirePageAuth, async (c) => {
  const user = c.get('user')
  const clientId = c.env.DOKU_CLIENT_ID
  const secretKey = c.env.DOKU_API_KEY

  if (!clientId || !secretKey) {
    return c.redirect('/dashboard?billing=config', 303)
  }

  const baseUrl = (c.env.BASE_URL ?? new URL(c.req.url).origin).replace(
    /\/$/,
    '',
  )
  const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO orders
       (user_id, invoice_number, amount, quota_amount, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
  )
    .bind(
      user.id,
      invoiceNumber,
      QUOTA_PACK_PRICE,
      QUOTA_PACK_SIZE,
      now,
      now,
    )
    .run()

  try {
    const checkout = await createDokuCheckout({
      clientId,
      secretKey,
      production: c.env.DOKU_IS_PRODUCTION === 'true',
      invoiceNumber,
      amount: QUOTA_PACK_PRICE,
      customer: {
        id: String(user.id),
        name: user.name,
        email: user.email,
      },
      callbackUrl: `${baseUrl}/payment/success?invoice=${encodeURIComponent(invoiceNumber)}`,
      notificationUrl: `${baseUrl}/billing/doku/notification`,
    })

    await c.env.DB.prepare(
      `UPDATE orders
       SET payment_url = ?, doku_token_id = ?, updated_at = ?
       WHERE invoice_number = ?`,
    )
      .bind(
        checkout.paymentUrl,
        checkout.tokenId,
        new Date().toISOString(),
        invoiceNumber,
      )
      .run()

    return c.redirect(checkout.paymentUrl, 303)
  } catch (error) {
    console.error('DOKU checkout failed', error)

    await c.env.DB.prepare(
      `UPDATE orders SET status = 'FAILED', updated_at = ? WHERE invoice_number = ?`,
    )
      .bind(new Date().toISOString(), invoiceNumber)
      .run()

    return c.redirect('/dashboard?billing=failed', 303)
  }
})

billingRoutes.post('/billing/check/:invoice', requirePageAuth, async (c) => {
  const user = c.get('user')
  const invoice = c.req.param('invoice')
  const credentials = dokuCredentialsFromEnv(c.env)

  if (!credentials) {
    return c.redirect('/dashboard?billing=config', 303)
  }

  const order = await findOrderByInvoice(c.env.DB, invoice)

  if (!order || order.userId !== user.id) {
    return c.redirect('/dashboard?billing=notfound', 303)
  }

  const result = await syncOrderStatus(c.env.DB, credentials, invoice)

  if (result.status === 'PAID') {
    return c.redirect('/dashboard?billing=paid', 303)
  }

  if (result.status === 'FAILED') {
    return c.redirect('/dashboard?billing=payment-failed', 303)
  }

  if (result.status === 'EXPIRED') {
    return c.redirect('/dashboard?billing=expired', 303)
  }

  return c.redirect('/dashboard?billing=pending', 303)
})

/**
 * DOKU HTTP notification webhook.
 * Configure this URL in DOKU: <BASE_URL>/billing/doku/notification
 */
billingRoutes.post('/billing/doku/notification', async (c) => {
  const clientId = c.env.DOKU_CLIENT_ID
  const secretKey = c.env.DOKU_API_KEY

  if (!clientId || !secretKey) {
    return c.json({ message: ['NOT_CONFIGURED'] }, 503)
  }

  const body = await c.req.text()
  const requestTarget = new URL(c.req.url).pathname

  const valid = await verifyDokuSignature({
    clientId,
    secretKey,
    requestId: c.req.header('Request-Id') ?? '',
    requestTimestamp: c.req.header('Request-Timestamp') ?? '',
    requestTarget,
    body,
    signature: c.req.header('Signature') ?? '',
  })

  if (!valid) {
    console.warn('Rejected DOKU notification with invalid signature')
    return c.json({ message: ['INVALID_SIGNATURE'] }, 401)
  }

  let payload: DokuNotification

  try {
    payload = JSON.parse(body) as DokuNotification
  } catch {
    return c.json({ message: ['INVALID_BODY'] }, 400)
  }

  const invoiceNumber = payload.order?.invoice_number

  if (!invoiceNumber) {
    return c.json({ message: ['MISSING_INVOICE_NUMBER'] }, 400)
  }

  const order = await findOrderByInvoice(c.env.DB, invoiceNumber)

  if (!order) {
    // Acknowledge unknown orders so DOKU does not retry them forever.
    console.warn('DOKU notification for unknown invoice', invoiceNumber)
    return c.json({ message: ['UNKNOWN_ORDER'] })
  }

  const status = (payload.transaction?.status ?? '').toUpperCase()

  if (status === 'SUCCESS') {
    const amount = Number(payload.order?.amount ?? 0)

    if (amount !== order.amount) {
      console.warn('DOKU amount mismatch', {
        invoiceNumber,
        expected: order.amount,
        received: amount,
      })
      return c.json({ message: ['AMOUNT_MISMATCH'] }, 400)
    }

    const settled = await settlePaidOrder(
      c.env.DB,
      invoiceNumber,
      order.userId,
    )

    return c.json({ message: settled ? ['SUCCESS'] : ['ALREADY_PROCESSED'] })
  }

  if (status === 'FAILED' || status === 'EXPIRED') {
    await updateOrderStatus(c.env.DB, invoiceNumber, status)
  }

  return c.json({ message: ['OK'] })
})
