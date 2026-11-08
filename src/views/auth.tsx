import type { AuthUser } from '../lib/env'
import { Alert, Topbar } from './components'

interface RegisterPageProps {
  user?: AuthUser | null
  error?: string | null
  values?: {
    name?: string
    email?: string
  }
}

export function RegisterPage({ user, error, values }: RegisterPageProps) {
  return (
    <>
      <Topbar user={user} />
      <main class="auth-shell">
        <section class="auth-card">
          <span class="eyebrow">Free account</span>
          <h1>Start finding creators</h1>
          <p class="muted">
            Create an account and get <strong>100 free API requests</strong>. No
            email verification and no credit card needed.
          </p>
          {error ? <Alert>{error}</Alert> : null}
          <form method="post" action="/register" class="form-stack">
            <label class="field">
              <span>Name</span>
              <input
                class="input"
                type="text"
                name="name"
                value={values?.name ?? ''}
                placeholder="Your name"
                autocomplete="name"
                maxlength={80}
                required
              />
            </label>
            <label class="field">
              <span>Email</span>
              <input
                class="input"
                type="email"
                name="email"
                value={values?.email ?? ''}
                placeholder="you@example.com"
                autocomplete="email"
                required
              />
            </label>
            <label class="field">
              <span>Password</span>
              <input
                class="input"
                type="password"
                name="password"
                placeholder="At least 8 characters"
                autocomplete="new-password"
                minlength={8}
                required
              />
            </label>
            <button class="button button-block" type="submit">
              Create account
            </button>
          </form>
          <p class="muted center">
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </section>
      </main>
    </>
  )
}

interface LoginPageProps {
  user?: AuthUser | null
  error?: string | null
  email?: string
  next?: string
}

export function LoginPage({ user, error, email, next }: LoginPageProps) {
  return (
    <>
      <Topbar user={user} />
      <main class="auth-shell">
        <section class="auth-card">
          <span class="eyebrow">Welcome back</span>
          <h1>Sign in to CABE3</h1>
          <p class="muted">
            Pick up where you left off and keep discovering creators.
          </p>
          {error ? <Alert>{error}</Alert> : null}
          <form method="post" action="/login" class="form-stack">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <label class="field">
              <span>Email</span>
              <input
                class="input"
                type="email"
                name="email"
                value={email ?? ''}
                placeholder="you@example.com"
                autocomplete="email"
                required
              />
            </label>
            <label class="field">
              <span>Password</span>
              <input
                class="input"
                type="password"
                name="password"
                placeholder="Your password"
                autocomplete="current-password"
                required
              />
            </label>
            <button class="button button-block" type="submit">
              Sign in
            </button>
          </form>
          <p class="muted center">
            New here? <a href="/register">Create a free account</a>
          </p>
        </section>
      </main>
    </>
  )
}
