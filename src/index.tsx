import { Hono } from 'hono'
import { Scalar } from '@scalar/hono-api-reference'
import type { Env } from './lib/env'
import { homeRoutes } from './routes/home'
import { askRoutes } from './routes/ask'
import { ingestRoutes } from './routes/ingest'
import { documentQueryRoutes } from './routes/query'
import { influencerRoutes } from './routes/influencers'
import { influencerQueryRoutes } from './routes/influencer-query'
import { registerDocsRoutes } from './routes/docs'

const app = new Hono<{ Bindings: Env }>()

app.route('/', homeRoutes)
app.route('/', askRoutes)
app.route('/', ingestRoutes)
app.route('/', documentQueryRoutes)
app.route('/', influencerRoutes)
app.route('/', influencerQueryRoutes)

registerDocsRoutes(app)
app.get('/scalar', Scalar({ url: '/openapi' }))

export default app
