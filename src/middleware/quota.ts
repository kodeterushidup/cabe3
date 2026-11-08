import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/env'
import { logApiRequest, refundQuota, reserveQuota } from '../lib/quota'

/**
 * Takes one request from the signed-in user's quota before the handler runs
 * and gives it back when the handler answers with an error status.
 */
export const requireQuota = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user')
  const reservation = await reserveQuota(c.env.DB, user.id)

  if (!reservation) {
    return c.json(
      {
        error: 'Quota exhausted',
        message:
          'You have no influencer requests left. Buy 1,000 more for Rp50.000 from your dashboard.',
        upgradeUrl: '/dashboard#billing',
        quota: 0,
      },
      402,
    )
  }

  let statusCode = 500

  try {
    await next()
    statusCode = c.res.status
  } finally {
    const succeeded = statusCode >= 200 && statusCode < 400
    const remaining = succeeded ? reservation.after : reservation.before

    c.header('X-Quota-Remaining', String(remaining))

    if (!succeeded) {
      try {
        await refundQuota(c.env.DB, user.id)
      } catch (error) {
        console.error('Failed to refund quota', error)
      }
    }

    try {
      await logApiRequest(c.env.DB, {
        userId: user.id,
        endpoint: c.req.path,
        method: c.req.method,
        statusCode,
        quotaBefore: reservation.before,
        quotaAfter: succeeded ? reservation.after : reservation.before,
      })
    } catch (error) {
      console.error('Failed to log API request', error)
    }
  }
})
