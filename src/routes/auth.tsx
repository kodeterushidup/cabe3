import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import {
  SESSION_COOKIE,
  createSession,
  createUser,
  deleteSession,
  findUserByEmail,
  normalizeEmail,
  verifyPassword,
} from '../lib/auth'
import { getDashboardData } from '../lib/dashboard'
import type { AppEnv } from '../lib/env'
import { QUOTA_PACK_SIZE } from '../lib/quota'
import {
  clearSessionCookie,
  readSessionUser,
  requireApiAuth,
  requirePageAuth,
  setSessionCookie,
} from '../middleware/auth'
import {
  RegisterPage,
  LoginPage,
} from '../views/auth'
import { DashboardPage } from '../views/dashboard'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function safeNextPath(value: string | undefined): string | null {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return null
  }

  return value
}

function validateRegistration(input: {
  name: string
  email: string
  password: string
}): string | null {
  if (input.name.length < 2 || input.name.length > 80) {
    return 'Please enter a name between 2 and 80 characters.'
  }

  if (!EMAIL_PATTERN.test(input.email) || input.email.length > 128) {
    return 'Please enter a valid email address.'
  }

  if (input.password.length < 8) {
    return 'Password must be at least 8 characters.'
  }

  return null
}

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/register', async (c) => {
  const user = await readSessionUser(c)

  if (user) {
    return c.redirect('/dashboard')
  }

  return c.render(<RegisterPage />, { title: 'Create account · CABE3' })
})

authRoutes.post('/register', async (c) => {
  const body = await c.req.parseBody()
  const name = String(body.name ?? '').trim()
  const email = normalizeEmail(String(body.email ?? ''))
  const password = String(body.password ?? '')
  const values = { name, email }

  const validationError = validateRegistration({ name, email, password })

  if (validationError) {
    c.status(400)
    return c.render(
      <RegisterPage error={validationError} values={values} />,
      { title: 'Create account · CABE3' },
    )
  }

  try {
    const existing = await findUserByEmail(c.env.DB, email)

    if (existing) {
      c.status(409)
      return c.render(
        <RegisterPage
          error="An account with this email already exists. Try signing in instead."
          values={values}
        />,
        { title: 'Create account · CABE3' },
      )
    }

    const user = await createUser(c.env.DB, { name, email, password })
    const session = await createSession(c.env.DB, user.id)

    setSessionCookie(c, session.token)

    return c.redirect('/dashboard?welcome=1', 303)
  } catch (error) {
    console.error('Registration failed', error)
    c.status(500)
    return c.render(
      <RegisterPage
        error="Could not create your account right now. Please try again."
        values={values}
      />,
      { title: 'Create account · CABE3' },
    )
  }
})

authRoutes.get('/login', async (c) => {
  const user = await readSessionUser(c)

  if (user) {
    return c.redirect('/dashboard')
  }

  return c.render(
    <LoginPage next={safeNextPath(c.req.query('next')) ?? undefined} />,
    { title: 'Sign in · CABE3' },
  )
})

authRoutes.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const email = normalizeEmail(String(body.email ?? ''))
  const password = String(body.password ?? '')
  const next = safeNextPath(
    typeof body.next === 'string' ? body.next : undefined,
  )

  if (!email || !password) {
    c.status(400)
    return c.render(
      <LoginPage
        error="Enter your email and password."
        email={email}
        next={next ?? undefined}
      />,
      { title: 'Sign in · CABE3' },
    )
  }

  try {
    const record = await findUserByEmail(c.env.DB, email)
    const valid = record
      ? await verifyPassword(password, record.passwordHash)
      : false

    if (!record || !valid) {
      c.status(401)
      return c.render(
        <LoginPage
          error="Email or password is incorrect."
          email={email}
          next={next ?? undefined}
        />,
        { title: 'Sign in · CABE3' },
      )
    }

    const session = await createSession(c.env.DB, record.id)
    setSessionCookie(c, session.token)

    return c.redirect(next ?? '/dashboard', 303)
  } catch (error) {
    console.error('Login failed', error)
    c.status(500)
    return c.render(
      <LoginPage
        error="Could not sign you in right now. Please try again."
        email={email}
        next={next ?? undefined}
      />,
      { title: 'Sign in · CABE3' },
    )
  }
})

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)

  if (token) {
    try {
      await deleteSession(c.env.DB, token)
    } catch (error) {
      console.error('Failed to delete session', error)
    }
  }

  clearSessionCookie(c)

  return c.redirect('/', 303)
})

authRoutes.get('/dashboard', requirePageAuth, async (c) => {
  const user = c.get('user')
  const data = await getDashboardData(c.env.DB, user.id)
  const billing = c.req.query('billing')

  let notice: string | null = null
  let error: string | null = null

  if (c.req.query('welcome') === '1') {
    notice = 'Welcome! Your 100 free requests are ready.'
  }

  if (billing === 'config') {
    error =
      'Payments are not configured yet. Add DOKU_CLIENT_ID and DOKU_API_KEY to enable checkout.'
  }

  if (billing === 'failed') {
    error = 'We could not start the DOKU payment. Please try again.'
  }

  if (billing === 'paid') {
    notice = `Payment confirmed. ${QUOTA_PACK_SIZE.toLocaleString(
      'en-US',
    )} requests were added to your account.`
  }

  if (billing === 'pending') {
    notice =
      'DOKU has not confirmed this payment yet. Wait about a minute, then press "Check status" again.'
  }

  if (billing === 'expired') {
    error = 'This payment link has expired. Create a new checkout to try again.'
  }

  if (billing === 'payment-failed') {
    error = 'DOKU reported that the payment failed. No credits were added.'
  }

  if (billing === 'notfound') {
    error = 'We could not find that order on your account.'
  }

  const paymentsEnabled = Boolean(
    c.env.DOKU_CLIENT_ID && c.env.DOKU_API_KEY,
  )

  return c.render(
    <DashboardPage
      user={user}
      data={data}
      paymentsEnabled={paymentsEnabled}
      notice={notice}
      error={error}
    />,
    { title: 'Dashboard · CABE3' },
  )
})

authRoutes.get('/api/me', requireApiAuth, (c) => {
  return c.json({ user: c.get('user') })
})
