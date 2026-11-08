import type { AuthUser } from '../lib/env'
import type { DashboardData } from '../lib/dashboard'
import { FREE_QUOTA, QUOTA_PACK_PRICE, QUOTA_PACK_SIZE } from '../lib/quota'
import {
  Alert,
  Footer,
  Topbar,
  formatDate,
  formatNumber,
  formatRupiah,
} from './components'

interface DashboardPageProps {
  user: AuthUser
  data: DashboardData
  paymentsEnabled: boolean
  notice?: string | null
  error?: string | null
}

function orderBadgeClass(status: string): string {
  if (status === 'PAID') {
    return 'badge badge-success'
  }

  if (status === 'FAILED' || status === 'EXPIRED') {
    return 'badge badge-error'
  }

  return 'badge'
}

function requestBadgeClass(statusCode: number): string {
  return statusCode >= 200 && statusCode < 400
    ? 'badge badge-success'
    : 'badge badge-error'
}

export function DashboardPage({
  user,
  data,
  paymentsEnabled,
  notice,
  error,
}: DashboardPageProps) {
  const totalQuota = FREE_QUOTA + data.purchasedQuota
  const firstName = user.name.split(' ')[0] || user.name

  return (
    <>
      <Topbar user={user} />
      <main class="dashboard">
        <header class="page-head">
          <div>
            <span class="eyebrow">Dashboard</span>
            <h1>Hi, {firstName}</h1>
            <p class="muted">
              Your account is ready. Use the API, then top up when you run out.
            </p>
          </div>
          <a
            class="button button-ghost"
            href="/openapi"
            target="_blank"
            rel="noreferrer"
          >
            API reference
          </a>
        </header>

        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}

        <section class="stat-grid">
          <article class="stat-card stat-card-accent">
            <span class="stat-label">Requests left</span>
            <strong class="stat-value">{formatNumber(user.quotaRemaining)}</strong>
            <span class="stat-hint">
              of {formatNumber(totalQuota)} total credits
            </span>
          </article>
          <article class="stat-card">
            <span class="stat-label">API requests made</span>
            <strong class="stat-value">{formatNumber(data.apiRequests)}</strong>
            <span class="stat-hint">influencer query endpoints</span>
          </article>
          <article class="stat-card">
            <span class="stat-label">Purchased credits</span>
            <strong class="stat-value">
              {formatNumber(data.purchasedQuota)}
            </strong>
            <span class="stat-hint">100 free + paid top-ups</span>
          </article>
        </section>

        <section class="dashboard-grid">
          <article class="panel" id="billing">
            <span class="eyebrow">Top up</span>
            <h2>1,000 more requests</h2>
            <p class="muted">
              One simple pack. Pay once with DOKU and the credits are added to
              your account after confirmation.
            </p>
            <div class="price-line">
              <strong>{formatRupiah(QUOTA_PACK_PRICE)}</strong>
              <span>per {formatNumber(QUOTA_PACK_SIZE)} requests</span>
            </div>
            {paymentsEnabled ? (
              <form method="post" action="/billing/checkout">
                <button class="button button-block" type="submit">
                  Pay with DOKU
                </button>
              </form>
            ) : (
              <div class="notice notice-warn">
                Payments are not configured yet. Add <code>DOKU_CLIENT_ID</code>{' '}
                and <code>DOKU_API_KEY</code> to enable checkout.
              </div>
            )}
            <p class="fine-print">
              DOKU sends a notification, and we also check the payment status
              with DOKU when you open the payment result page or press "Check
              status". Credits are added once the payment is confirmed.
            </p>
          </article>

          <article class="panel">
            <span class="eyebrow">Quick start</span>
            <h2>Call the API</h2>
            <p class="muted">
              Your browser session is sent with each request. API clients should
              reuse the <code>cabe_session</code> cookie.
            </p>
            <pre class="code-block"><code>{`POST /influencers/query
Content-Type: application/json

{
  "prompt": "Which fitness creators in Indonesia have more than 100k followers?"
}`}</code></pre>
            <a href="/openapi" class="text-link">
              Open the API reference →
            </a>
          </article>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Recent API requests</h2>
            <span class="muted small">Last 8 requests</span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRequests.length === 0 ? (
                  <tr>
                    <td colspan={4} class="muted center">
                      No API requests yet. Try the influencer search endpoint.
                    </td>
                  </tr>
                ) : (
                  data.recentRequests.map((request) => (
                    <tr>
                      <td>
                        <code>{request.endpoint}</code>
                      </td>
                      <td>{request.method}</td>
                      <td>
                        <span class={requestBadgeClass(request.statusCode)}>
                          {request.statusCode}
                        </span>
                      </td>
                      <td class="muted">{formatDate(request.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {data.orders.length > 0 ? (
          <section class="panel">
            <div class="panel-head">
              <h2>Purchases</h2>
              <span class="muted small">Last 5 orders</span>
            </div>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Credits</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr>
                      <td>
                        <code>{order.invoiceNumber}</code>
                      </td>
                      <td>{formatNumber(order.quotaAmount)}</td>
                      <td>{formatRupiah(order.amount)}</td>
                      <td>
                        <span class={orderBadgeClass(order.status)}>
                          {order.status}
                        </span>
                      </td>
                      <td class="muted">
                        {formatDate(order.createdAt)}
                        {order.status === 'PENDING' && order.paymentUrl ? (
                          <>
                            {' · '}
                            <a href={order.paymentUrl}>Resume payment</a>
                          </>
                        ) : null}
                        {order.status === 'PENDING' ? (
                          <form
                            class="check-form"
                            method="post"
                            action={`/billing/check/${order.invoiceNumber}`}
                          >
                            <button
                              class="button button-ghost button-small"
                              type="submit"
                            >
                              Check status
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  )
}
