import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { Env } from '../lib/env'
import { findYouTubeChannels, upsertYouTubeChannels } from '../lib/influencers'
import { YouTubeError, searchYouTubeChannels } from '../lib/youtube'

const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('Text to search for, e.g. a creator name, niche, or keyword'),
  maxResults: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('How many YouTube channels to fetch (1-50)'),
  regionCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional()
    .describe('ISO 3166-1 alpha-2 country code used to bias the search'),
  relevanceLanguage: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .optional()
    .describe('BCP 47 language code used to bias the search, e.g. "en" or "pt-BR"'),
})

const influencerSchema = z.object({
  id: z.number().int().describe('Database id of the stored influencer'),
  name: z.string().describe('Channel display name'),
  bio: z.string().nullable().describe('Channel description'),
  platform: z.string().describe('Platform id, always "youtube" here'),
  handle: z.string().describe('Channel handle without the leading "@"'),
  profileUrl: z.string().nullable().describe('Canonical channel URL'),
  avatarUrl: z.string().nullable().describe('Channel avatar URL'),
  country: z.string().nullable().describe('ISO 3166-1 alpha-2 code reported by YouTube'),
  followers: z.number().int().describe('Subscriber count'),
  totalPosts: z.number().int().describe('Video count'),
  isVerified: z.number().int().describe('1 when verified, otherwise 0'),
  createdAt: z.string().describe('Row creation timestamp'),
  updatedAt: z.string().describe('Row update timestamp'),
})

const searchResponseSchema = z.object({
  query: z.string().describe('The search text that was sent to YouTube'),
  count: z.number().int().nonnegative().describe('Number of influencers returned'),
  influencers: z.array(influencerSchema).describe('Stored rows sorted by follower count'),
})

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export const influencerRoutes = new Hono<{ Bindings: Env }>()

influencerRoutes.get(
  '/influencers/search',
  describeRoute({
    tags: ['Influencers'],
    summary: 'Search YouTube channels and ingest them as influencers',
    description:
      'Searches YouTube with `search.list` (type=channel), enriches the hits with subscriber and video counts from `channels.list`, then upserts them into the `influencers` table keyed by `(platform, handle)`. Existing YouTube rows are refreshed, never duplicated. The response returns the stored rows sorted by follower count.',
    responses: {
      200: {
        description: 'The channels were searched, ingested, and read back from D1',
        content: {
          'application/json': {
            schema: resolver(searchResponseSchema),
          },
        },
      },
      400: {
        description: 'Invalid query parameters',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      500: {
        description: 'D1 failed to store or read the influencers',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      502: {
        description: 'The YouTube Data API rejected the request or the quota was exhausted',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      503: {
        description: 'The YOUTUBE_API_KEY secret is not configured',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  validator('query', searchQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Invalid query parameters',
          message: result.error.map((issue) => issue.message).join(', '),
        },
        400,
      )
    }
  }),
  async (c) => {
    const { q, maxResults, regionCode, relevanceLanguage } = c.req.valid('query')
    const apiKey = c.env.YOUTUBE_API_KEY

    if (!apiKey) {
      return c.json(
        {
          error: 'YouTube API key missing',
          message:
            'Set YOUTUBE_API_KEY in .dev.vars for local development, or run `wrangler secret put YOUTUBE_API_KEY`.',
        },
        503,
      )
    }

    try {
      const channels = await searchYouTubeChannels(apiKey, q, {
        maxResults,
        regionCode,
        relevanceLanguage,
      })

      await upsertYouTubeChannels(c.env.DB, channels)

      const influencers = await findYouTubeChannels(
        c.env.DB,
        channels.map((channel) => channel.handle),
      )

      return c.json({ query: q, count: influencers.length, influencers })
    } catch (error) {
      if (error instanceof YouTubeError) {
        return c.json({ error: error.code, message: error.message }, error.status)
      }

      console.error(error)

      return c.json(
        {
          error: 'Failed to ingest influencers',
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      )
    }
  },
)
