import type { Hono } from 'hono'
import { openAPIRouteHandler } from 'hono-openapi'

export function registerDocsRoutes(app: Hono<any>) {
  app.get(
    '/openapi',
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: 'Hono API',
          version: '1.0.0',
          description:
            'CABE3 API: email/password accounts with request quotas, DOKU checkout for extra quota, AI answers, natural-language influencer queries with tool calling, PDF ingestion into Vectorize, semantic PDF search, and YouTube channel search into the influencers table. The influencer endpoints require a signed-in session and cost 1 request each.',
        },
        servers: [
          { url: process.env.BASE_URL ?? '', description: 'Local Server' },
        ],
      },
    }),
  )
}
