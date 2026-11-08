import type { AuthUser } from '../lib/env'
import { QUOTA_PACK_SIZE } from '../lib/quota'
import { Footer, Topbar, formatNumber } from './components'

export type PaymentState = 'paid' | 'pending' | 'failed'

interface PaymentResultPageProps {
  state: PaymentState
  invoice?: string | null
  user: AuthUser
  message?: string | null
}

const TITLES: Record<PaymentState, string> = {
  paid: 'Payment received',
  pending: 'Confirming your payment',
  failed: 'Payment not completed',
}

const ICONS: Record<PaymentState, string> = {
  paid: '✓',
  pending: '…',
  failed: '!',
}

const ICON_CLASSES: Record<PaymentState, string> = {
  paid: 'status-icon status-icon-ok',
  pending: 'status-icon',
  failed: 'status-icon status-icon-bad',
}

export function PaymentResultPage({
  state,
  invoice,
  user,
  message,
}: PaymentResultPageProps) {
  return (
    <>
      <Topbar user={user} />
      <main class="auth-shell">
        <section class="auth-card center">
          <span class={ICON_CLASSES[state]}>{ICONS[state]}</span>
          <h1>{TITLES[state]}</h1>
          {state === 'paid' ? (
            <p class="muted">
              Thanks! Your {formatNumber(QUOTA_PACK_SIZE)} extra requests are
              now available on your account.
            </p>
          ) : null}
          {state === 'pending' ? (
            <p class="muted">
              DOKU has not confirmed the payment yet. This can take up to a
              minute after you pay. Check again in a few seconds.
            </p>
          ) : null}
          {state === 'failed' ? (
            <p class="muted">
              The payment was cancelled, expired, or could not be completed. You
              can try again from the dashboard.
            </p>
          ) : null}
          {message ? <p class="muted small">{message}</p> : null}
          {invoice ? (
            <p class="fine-print">
              Invoice: <code>{invoice}</code>
            </p>
          ) : null}
          {state === 'pending' && invoice ? (
            <form method="post" action={`/billing/check/${invoice}`}>
              <button class="button button-ghost button-block" type="submit">
                Check payment status
              </button>
            </form>
          ) : null}
          <a class="button button-block" href="/dashboard">
            Go to dashboard
          </a>
        </section>
      </main>
      <Footer />
    </>
  )
}
