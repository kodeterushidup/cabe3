import type { D1Database } from './env'

export interface OrderRow {
  id: number
  userId: number
  invoiceNumber: string
  amount: number
  quotaAmount: number
  status: string
  paymentUrl: string | null
}

export async function findOrderByInvoice(
  db: D1Database,
  invoiceNumber: string,
): Promise<OrderRow | null> {
  return db
    .prepare(
      `SELECT
         id,
         user_id AS userId,
         invoice_number AS invoiceNumber,
         amount,
         quota_amount AS quotaAmount,
         status,
         payment_url AS paymentUrl
       FROM orders
       WHERE invoice_number = ?`,
    )
    .bind(invoiceNumber)
    .first<OrderRow>()
}

/**
 * Marks a pending order as paid and credits the user's quota in one D1 batch.
 * The `credited_at` guard makes duplicate DOKU notifications safe.
 */
export async function settlePaidOrder(
  db: D1Database,
  invoiceNumber: string,
  userId: number,
): Promise<boolean> {
  const now = new Date().toISOString()

  const results = await db.batch([
    db
      .prepare(
        `UPDATE orders
         SET status = 'PAID', paid_at = ?, updated_at = ?
         WHERE invoice_number = ? AND status = 'PENDING'`,
      )
      .bind(now, now, invoiceNumber),
    db
      .prepare(
        `UPDATE users
         SET quota_remaining = quota_remaining + COALESCE((
           SELECT quota_amount
           FROM orders
           WHERE invoice_number = ? AND status = 'PAID' AND credited_at IS NULL
         ), 0), updated_at = ?
         WHERE id = ?`,
      )
      .bind(invoiceNumber, now, userId),
    db
      .prepare(
        `UPDATE orders
         SET credited_at = ?, updated_at = ?
         WHERE invoice_number = ? AND status = 'PAID' AND credited_at IS NULL`,
      )
      .bind(now, now, invoiceNumber),
  ])

  return Number(results[0]?.meta?.changes ?? 0) > 0
}

export async function updateOrderStatus(
  db: D1Database,
  invoiceNumber: string,
  status: 'FAILED' | 'EXPIRED',
): Promise<void> {
  await db
    .prepare(
      `UPDATE orders
       SET status = ?, updated_at = ?
       WHERE invoice_number = ? AND status = 'PENDING'`,
    )
    .bind(status, new Date().toISOString(), invoiceNumber)
    .run()
}
