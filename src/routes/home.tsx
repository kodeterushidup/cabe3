import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'
import { readSessionUser } from '../middleware/auth'
import { HomePage } from '../views/home'

export const homeRoutes = new Hono<AppEnv>()

homeRoutes.get('/', async (c) => {
  const user = await readSessionUser(c)

  return c.render(<HomePage user={user} />, {
    title: 'CABE3 — Influencer discovery API',
  })
})
