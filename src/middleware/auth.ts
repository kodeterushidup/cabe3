import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  findUserBySessionToken,
} from '../lib/auth'
import type { AppEnv, AuthUser } from '../lib/env'

function isSecure(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

function bearerToken(c: Context<AppEnv>): string {
  const header = c.req.header('Authorization')

  return header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export async function readSessionUser(
  c: Context<AppEnv>,
): Promise<AuthUser | null> {
  const token = bearerToken(c) || getCookie(c, SESSION_COOKIE) || ''

  if (!token) {
    return null
  }

  return findUserBySessionToken(c.env.DB, token)
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: isSecure(c.req.url),
    maxAge: SESSION_TTL_SECONDS,
  })
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Auth guard for JSON API endpoints. */
export const requireApiAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await readSessionUser(c)

  if (!user) {
    return c.json(
      {
        error: 'Unauthorized',
        message:
          'Sign in to use this endpoint. The session cookie is set when you log in.',
      },
      401,
    )
  }

  c.set('user', user)
  await next()
})

/** Auth guard for HTML pages. Redirects to the login page instead of returning JSON. */
export const requirePageAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await readSessionUser(c)

  if (!user) {
    const nextPath = c.req.path + (new URL(c.req.url).search || '')
    return c.redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  }

  c.set('user', user)
  await next()
})
