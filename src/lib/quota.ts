import type { D1Database } from './env'

export const FREE_QUOTA = 100
export const QUOTA_PACK_SIZE = 1000
export const QUOTA_PACK_PRICE = 50_000

export interface QuotaReservation {
  before: number
  after: number
}

/**
 * Atomically takes one request from the user's quota.
 * Returns `null` when the user has no quota left.
 */
export async function reserveQuota(
  db: D1Database,
  userId: number,
): Promise<QuotaReservation | null> {
  const now = new Date().toISOString()

  const result = await db
    .prepare(
      `UPDATE users
       SET quota_remaining = quota_remaining - 1, updated_at = ?
       WHERE id = ? AND quota_remaining > 0`,
    )
    .bind(now, userId)
    .run()

  if (Number(result.meta?.changes ?? 0) === 0) {
    return null
  }

  const row = await db
    .prepare('SELECT quota_remaining FROM users WHERE id = ?')
    .bind(userId)
    .first<{ quota_remaining: number }>()

  const after = row?.quota_remaining ?? 0

  return { before: after + 1, after }
}

export async function refundQuota(
  db: D1Database,
  userId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users
       SET quota_remaining = quota_remaining + 1, updated_at = ?
       WHERE id = ?`,
    )
    .bind(new Date().toISOString(), userId)
    .run()
}

export async function addQuota(
  db: D1Database,
  userId: number,
  amount: number,
): Promise<void> {
  if (amount <= 0) {
    return
  }

  await db
    .prepare(
      `UPDATE users
       SET quota_remaining = quota_remaining + ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(amount, new Date().toISOString(), userId)
    .run()
}

export interface ApiRequestLog {
  userId: number
  endpoint: string
  method: string
  statusCode: number
  quotaBefore: number
  quotaAfter: number
}

export async function logApiRequest(
  db: D1Database,
  entry: ApiRequestLog,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO api_requests
         (user_id, endpoint, method, status_code, quota_before, quota_after)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.userId,
      entry.endpoint,
      entry.method,
      entry.statusCode,
      entry.quotaBefore,
      entry.quotaAfter,
    )
    .run()
}
