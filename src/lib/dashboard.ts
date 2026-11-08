import type { D1Database } from './env'

export interface RecentApiRequest {
  endpoint: string
  method: string
  statusCode: number
  createdAt: string
}

export interface UserOrder {
  invoiceNumber: string
  amount: number
  quotaAmount: number
  status: string
  createdAt: string
  paymentUrl: string | null
}

export interface DashboardData {
  apiRequests: number
  purchasedQuota: number
  recentRequests: RecentApiRequest[]
  orders: UserOrder[]
}

interface CountRow {
  count: number
}

interface SumRow {
  total: number | null
}

export async function getDashboardData(
  db: D1Database,
  userId: number,
): Promise<DashboardData> {
  const [requests, purchased, recent, orders] = await Promise.all([
    db
      .prepare('SELECT COUNT(*) AS count FROM api_requests WHERE user_id = ?')
      .bind(userId)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(quota_amount), 0) AS total
         FROM orders
         WHERE user_id = ? AND status = 'PAID'`,
      )
      .bind(userId)
      .first<SumRow>(),
    db
      .prepare(
        `SELECT
           endpoint,
           method,
           status_code AS statusCode,
           created_at AS createdAt
         FROM api_requests
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 8`,
      )
      .bind(userId)
      .all<RecentApiRequest>(),
    db
      .prepare(
        `SELECT
           invoice_number AS invoiceNumber,
           amount,
           quota_amount AS quotaAmount,
           status,
           created_at AS createdAt,
           payment_url AS paymentUrl
         FROM orders
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 5`,
      )
      .bind(userId)
      .all<UserOrder>(),
  ])

  return {
    apiRequests: requests?.count ?? 0,
    purchasedQuota: purchased?.total ?? 0,
    recentRequests: recent.results ?? [],
    orders: orders.results ?? [],
  }
}
