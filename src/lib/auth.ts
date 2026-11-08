import {
  base64ToBytes,
  bytesToBase64,
  randomToken,
  sha256Base64,
  timingSafeEqual,
} from './crypto'
import type { AuthUser, D1Database } from './env'
import { FREE_QUOTA } from './quota'

export const SESSION_COOKIE = 'cabe_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BITS = 256
const encoder = new TextEncoder()

interface UserRow {
  id: number
  email: string
  name: string
  passwordHash: string
  quotaRemaining: number
  createdAt: string
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BITS,
  )

  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derivePassword(password, salt, PBKDF2_ITERATIONS)

  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split('$')

  if (scheme !== 'pbkdf2' || !iterationsRaw || !saltRaw || !hashRaw) {
    return false
  }

  const iterations = Number(iterationsRaw)

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false
  }

  const expected = base64ToBytes(hashRaw)
  const actual = await derivePassword(password, base64ToBytes(saltRaw), iterations)

  return timingSafeEqual(expected, actual)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function createUser(
  db: D1Database,
  input: { name: string; email: string; password: string },
): Promise<AuthUser> {
  const now = new Date().toISOString()
  const passwordHash = await hashPassword(input.password)

  const result = await db
    .prepare(
      `INSERT INTO users (email, name, password_hash, quota_remaining, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      normalizeEmail(input.email),
      input.name,
      passwordHash,
      FREE_QUOTA,
      now,
      now,
    )
    .run()

  return {
    id: Number(result.meta?.last_row_id ?? 0),
    email: normalizeEmail(input.email),
    name: input.name,
    quotaRemaining: FREE_QUOTA,
    createdAt: now,
  }
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT
         id,
         email,
         name,
         password_hash AS passwordHash,
         quota_remaining AS quotaRemaining,
         created_at AS createdAt
       FROM users
       WHERE email = ?`,
    )
    .bind(normalizeEmail(email))
    .first<UserRow>()
}

export interface Session {
  token: string
  expiresAt: string
}

export async function createSession(
  db: D1Database,
  userId: number,
): Promise<Session> {
  const token = randomToken()
  const tokenHash = await sha256Base64(token)
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000,
  ).toISOString()

  await db
    .prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    )
    .bind(tokenHash, userId, expiresAt)
    .run()

  return { token, expiresAt }
}

export async function findUserBySessionToken(
  db: D1Database,
  token: string,
): Promise<AuthUser | null> {
  if (!token) {
    return null
  }

  const tokenHash = await sha256Base64(token)

  return db
    .prepare(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.quota_remaining AS quotaRemaining,
         u.created_at AS createdAt
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<AuthUser>()
}

export async function deleteSession(
  db: D1Database,
  token: string,
): Promise<void> {
  const tokenHash = await sha256Base64(token)

  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .run()
}
