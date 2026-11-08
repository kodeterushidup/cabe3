import { hmacSha256Base64, sha256Base64, timingSafeEqual } from './crypto'

const SANDBOX_BASE_URL = 'https://api-sandbox.doku.com'
const PRODUCTION_BASE_URL = 'https://api.doku.com'
const CHECKOUT_TARGET = '/checkout/v1/payment'
const STATUS_TARGET_PREFIX = '/orders/v1/status/'

const encoder = new TextEncoder()

export interface DokuCheckoutInput {
  clientId: string
  secretKey: string
  production: boolean
  invoiceNumber: string
  amount: number
  customer: {
    id: string
    name: string
    email: string
  }
  callbackUrl: string
  notificationUrl: string
}

export interface DokuCheckoutResult {
  paymentUrl: string
  tokenId: string | null
}

export interface DokuSignatureInput {
  clientId: string
  secretKey: string
  requestId: string
  requestTimestamp: string
  requestTarget: string
  /** Body of the request. Omit for GET requests: DOKU then excludes Digest. */
  body?: string | null
}

export interface DokuOrderStatusInput {
  clientId: string
  secretKey: string
  production: boolean
  invoiceNumber: string
}

export interface DokuOrderStatusResult {
  status: string
  amount: number | null
  raw: unknown
}

export interface DokuNotification {
  service?: {
    id?: string
  }
  order?: {
    invoice_number?: string
    amount?: number | string
  }
  transaction?: {
    status?: string
    date?: string
  }
  channel?: {
    response_code?: string
    response_message?: string
  }
}

export class DokuError extends Error {
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'DokuError'
    this.status = status
  }
}

function baseUrl(production: boolean): string {
  return production ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

function requestTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export async function createDokuSignature(
  input: DokuSignatureInput,
): Promise<string> {
  const parts = [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.requestTimestamp}`,
    `Request-Target:${input.requestTarget}`,
  ]

  // GET requests (e.g. Check Status) are signed without the Digest component.
  if (typeof input.body === 'string') {
    parts.push(`Digest:${await sha256Base64(input.body)}`)
  }

  const component = parts.join('\n')

  const signature = await hmacSha256Base64(input.secretKey, component)
  return `HMACSHA256=${signature}`
}

export async function verifyDokuSignature(
  input: DokuSignatureInput & { signature: string },
): Promise<boolean> {
  if (!input.requestId || !input.requestTimestamp || !input.signature) {
    return false
  }

  const expected = await createDokuSignature(input)

  return timingSafeEqual(encoder.encode(expected), encoder.encode(input.signature))
}

export async function getDokuOrderStatus(
  input: DokuOrderStatusInput,
): Promise<DokuOrderStatusResult> {
  const requestTarget = `${STATUS_TARGET_PREFIX}${encodeURIComponent(
    input.invoiceNumber,
  )}`
  const requestId = crypto.randomUUID()
  const timestamp = requestTimestamp()
  const signature = await createDokuSignature({
    clientId: input.clientId,
    secretKey: input.secretKey,
    requestId,
    requestTimestamp: timestamp,
    requestTarget,
  })

  const response = await fetch(`${baseUrl(input.production)}${requestTarget}`, {
    method: 'GET',
    headers: {
      'Client-Id': input.clientId,
      'Request-Id': requestId,
      'Request-Timestamp': timestamp,
      Signature: signature,
    },
  })

  const text = await response.text()
  let payload: any

  try {
    payload = JSON.parse(text)
  } catch {
    throw new DokuError(
      `DOKU returned an unreadable status response (HTTP ${response.status}).`,
    )
  }

  if (!response.ok) {
    const messages: unknown =
      payload?.error_messages ?? payload?.message ?? text.slice(0, 300)
    const detail = Array.isArray(messages) ? messages.join('; ') : String(messages)

    throw new DokuError(`DOKU status check failed: ${detail}`)
  }

  const amount = Number(payload?.order?.amount ?? NaN)

  return {
    status: String(payload?.transaction?.status ?? '').toUpperCase(),
    amount: Number.isFinite(amount) ? amount : null,
    raw: payload,
  }
}

export async function createDokuCheckout(
  input: DokuCheckoutInput,
): Promise<DokuCheckoutResult> {
  const body = JSON.stringify({
    order: {
      amount: input.amount,
      invoice_number: input.invoiceNumber,
      currency: 'IDR',
      callback_url: input.callbackUrl,
      callback_url_result: input.callbackUrl,
      language: 'EN',
      auto_redirect: true,
      line_items: [
        {
          id: 'quota-1000',
          name: '1,000 influencer search requests',
          quantity: 1,
          price: input.amount,
          sku: 'QUOTA-1000',
          category: 'digital-content',
        },
      ],
    },
    payment: {
      payment_due_date: 60,
    },
    customer: {
      id: input.customer.id,
      name: input.customer.name,
      email: input.customer.email,
      country: 'ID',
    },
    additional_info: {
      override_notification_url: input.notificationUrl,
    },
  })

  const requestId = crypto.randomUUID()
  const timestamp = requestTimestamp()
  const signature = await createDokuSignature({
    clientId: input.clientId,
    secretKey: input.secretKey,
    requestId,
    requestTimestamp: timestamp,
    requestTarget: CHECKOUT_TARGET,
    body,
  })

  const response = await fetch(`${baseUrl(input.production)}${CHECKOUT_TARGET}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': input.clientId,
      'Request-Id': requestId,
      'Request-Timestamp': timestamp,
      Signature: signature,
    },
    body,
  })

  const text = await response.text()
  let payload: any

  try {
    payload = JSON.parse(text)
  } catch {
    throw new DokuError(
      `DOKU returned an unreadable response (HTTP ${response.status}).`,
    )
  }

  if (!response.ok) {
    const messages: unknown =
      payload?.error_messages ?? payload?.message ?? text.slice(0, 300)
    const detail = Array.isArray(messages) ? messages.join('; ') : String(messages)

    throw new DokuError(`DOKU rejected the payment request: ${detail}`)
  }

  const paymentUrl = payload?.response?.payment?.url

  if (typeof paymentUrl !== 'string' || paymentUrl.length === 0) {
    throw new DokuError('DOKU did not return a payment URL.')
  }

  return {
    paymentUrl,
    tokenId:
      typeof payload?.response?.payment?.token_id === 'string'
        ? payload.response.payment.token_id
        : null,
  }
}
