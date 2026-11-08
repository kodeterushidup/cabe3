import type { AuthUser } from '../lib/env'
import { FREE_QUOTA, QUOTA_PACK_PRICE, QUOTA_PACK_SIZE } from '../lib/quota'
import {
  Footer,
  Topbar,
  formatNumber,
  formatRupiah,
} from './components'

export function HomePage({ user }: { user?: AuthUser | null }) {
  return (
    <>
      <Topbar user={user} />
      <main class="landing">
        <section class="hero">
          <div class="hero-copy">
            <span class="eyebrow">Influencer discovery API</span>
            <h1>
              Find the right creators{' '}
              <span class="accent">before your competitors do.</span>
            </h1>
            <p class="lede">
              Search YouTube creators, ask natural-language questions, and pull
              clean creator data into your product. Start with{' '}
              {formatNumber(FREE_QUOTA)} free requests — no email verification,
              no credit card.
            </p>
            <div class="hero-actions">
              <a class="button" href="/register">
                Start free
              </a>
              <a class="button button-ghost" href="/login">
                Sign in
              </a>
            </div>
            <ul class="checklist">
              <li>{formatNumber(FREE_QUOTA)} free API requests on signup</li>
              <li>Search by niche, country, followers, and keywords</li>
              <li>
                Top up {formatNumber(QUOTA_PACK_SIZE)} requests for{' '}
                {formatRupiah(QUOTA_PACK_PRICE)} when you need more
              </li>
            </ul>
          </div>

          <div class="hero-card" aria-hidden="true">
            <div class="mock-window">
              <div class="mock-bar">
                <span class="mock-dot"></span>
                <span class="mock-dot"></span>
                <span class="mock-dot"></span>
              </div>
              <div class="mock-body">
                <div class="mock-search">
                  <span class="mock-search-icon">⌕</span>
                  <span>fitness creators in Indonesia</span>
                </div>
                <div class="mock-row">
                  <span class="mock-avatar mock-avatar-one"></span>
                  <span class="mock-lines">
                    <span class="mock-line mock-line-strong"></span>
                    <span class="mock-line"></span>
                  </span>
                  <span class="mock-followers">1.2M</span>
                </div>
                <div class="mock-row">
                  <span class="mock-avatar mock-avatar-two"></span>
                  <span class="mock-lines">
                    <span class="mock-line mock-line-strong"></span>
                    <span class="mock-line"></span>
                  </span>
                  <span class="mock-followers">684K</span>
                </div>
                <div class="mock-row">
                  <span class="mock-avatar mock-avatar-three"></span>
                  <span class="mock-lines">
                    <span class="mock-line mock-line-strong"></span>
                    <span class="mock-line"></span>
                  </span>
                  <span class="mock-followers">231K</span>
                </div>
                <div class="mock-answer">
                  <span class="mock-answer-label">AI answer</span>
                  <p>
                    These three creators match your filters, led by a fitness
                    channel with 1.2M subscribers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="pricing" id="pricing">
          <div class="pricing-card">
            <div>
              <span class="eyebrow">Simple pricing</span>
              <h2>{formatNumber(FREE_QUOTA)} free requests. Then one flat pack.</h2>
              <p class="muted">
                No subscriptions, no seats, no surprise overage. Buy more only
                when you need it.
              </p>
            </div>
            <div class="price-box">
              <span class="price-tag">{formatRupiah(QUOTA_PACK_PRICE)}</span>
              <span class="muted">
                for {formatNumber(QUOTA_PACK_SIZE)} requests
              </span>
              <a class="button button-block" href="/register">
                Create free account
              </a>
              <span class="fine-print">
                New accounts start with {formatNumber(FREE_QUOTA)} requests.
              </span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
