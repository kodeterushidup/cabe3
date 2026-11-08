import { Hono } from 'hono'
import { Scalar } from '@scalar/hono-api-reference'
import type { AppEnv } from './lib/env'
import { renderer } from './renderer'
import { homeRoutes } from './routes/home'
import { authRoutes } from './routes/auth'
import { billingRoutes } from './routes/billing'
import { paymentRoutes } from './routes/payment'
import { askRoutes } from './routes/ask'
import { ingestRoutes } from './routes/ingest'
import { documentQueryRoutes } from './routes/query'
import { influencerRoutes } from './routes/influencers'
import { influencerQueryRoutes } from './routes/influencer-query'
import { registerDocsRoutes } from './routes/docs'

const app = new Hono<AppEnv>()

app.use('*', renderer)

app.route('/', homeRoutes)
app.route('/', authRoutes)
app.route('/', billingRoutes)
app.route('/', paymentRoutes)
app.route('/', askRoutes)
app.route('/', ingestRoutes)
app.route('/', documentQueryRoutes)
app.route('/', influencerRoutes)
app.route('/', influencerQueryRoutes)

registerDocsRoutes(app)
app.get('/scalar', Scalar({ url: '/openapi' }))

export default app
