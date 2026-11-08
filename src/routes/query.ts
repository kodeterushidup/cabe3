import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { Env } from '../lib/env'
import { searchDocuments } from '../lib/search'

const searchRequestSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe('Natural-language text to search for inside the ingested PDFs'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('How many chunks to return (1-20, default 5)'),
  minScore: z
    .number()
    .min(-1)
    .max(1)
    .optional()
    .describe('Drop matches whose cosine similarity is below this value'),
})

const matchSchema = z.object({
  id: z.string().describe('Vectorize vector id'),
  score: z.number().describe('Cosine similarity between the query and the chunk'),
  documentId: z.string().nullable().describe('Content hash id assigned during ingestion'),
  source: z.string().nullable().describe('Original PDF file name'),
  chunkIndex: z.number().int().nullable().describe('Position of the chunk inside the document'),
  text: z.string().nullable().describe('Chunk text'),
})

const searchResponseSchema = z.object({
  query: z.string().describe('The search text that was embedded'),
  topK: z.number().int().positive(),
  embeddingModel: z.string().describe('Workers AI model used to embed the query'),
  count: z.number().int().nonnegative().describe('Number of matches returned'),
  results: z.array(matchSchema).describe('Matches sorted by similarity, highest first'),
})

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export const documentQueryRoutes = new Hono<{ Bindings: Env }>()

documentQueryRoutes.post(
  '/query',
  describeRoute({
    tags: ['Search'],
    summary: 'Semantically query the ingested PDF documents',
    description:
      'Embeds the query with `@cf/baai/bge-m3` and runs a nearest-neighbour search on the `cabe3-documents` Vectorize index. Returns the closest chunks with their similarity score and source metadata.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: resolver(searchRequestSchema),
        },
      },
    },
    responses: {
      200: {
        description: 'The closest chunks from the ingested PDFs',
        content: {
          'application/json': {
            schema: resolver(searchResponseSchema),
          },
        },
      },
      400: {
        description: 'Invalid request body',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      500: {
        description: 'The embedding or Vectorize query failed',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  validator('json', searchRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Invalid request body',
          message: result.error.map((issue) => issue.message).join(', '),
        },
        400,
      )
    }
  }),
  async (c) => {
    const { query, topK, minScore } = c.req.valid('json')

    try {
      const result = await searchDocuments(c.env, query, topK, minScore)

      return c.json(result)
    } catch (error) {
      console.error(error)

      return c.json(
        {
          error: 'Failed to search documents',
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      )
    }
  },
)
