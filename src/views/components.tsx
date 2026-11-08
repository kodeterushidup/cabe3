import type { Child } from 'hono/jsx'
import type { AuthUser } from '../lib/env'

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatRupiah(value: number): string {
  return `Rp${value.toLocaleString('id-ID')}`
}

export function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function Topbar({ user }: { user?: AuthUser | null }) {
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true">
            C
          </span>
          <span>
            CABE<span class="brand-accent">3</span>
          </span>
        </a>
        <nav class="topbar-nav">
          {user ? (
            <>
              <a
                class="quota-pill"
                href="/dashboard"
                title="Remaining API requests"
              >
                {formatNumber(user.quotaRemaining)} requests left
              </a>
              <a class="nav-link" href="/dashboard">
                Dashboard
              </a>
              <form method="post" action="/logout" class="inline-form">
                <button class="nav-link nav-link-button" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <a class="nav-link" href="/login">
                Sign in
              </a>
              <a class="button button-small" href="/register">
                Get started free
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info'
  children: Child
}) {
  return <div class={`alert alert-${tone}`}>{children}</div>
}

export function Footer() {
  return (
    <footer class="footer">
      <span>
        <strong>CABE3</strong> — influencer discovery for builders.
      </span>
      <span class="footer-links">
        <a href="/openapi">API reference</a>
        <a href="/register">Start free</a>
      </span>
    </footer>
  )
}
