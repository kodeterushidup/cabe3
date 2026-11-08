import { Hono, type Context } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'
import type { Env } from '../lib/env'
import { IngestError, ingestPdf } from '../lib/ingest'

const ingestResponseSchema = z.object({
  documentId: z.string().describe('Stable id derived from the PDF content hash'),
  filename: z.string().describe('Original file name'),
  chunks: z.number().int().nonnegative().describe('Number of text chunks stored'),
  vectorIds: z.array(z.string()).describe('Vectorize ids that were written'),
  embeddingModel: z.string().describe('Workers AI model used to embed the chunks'),
  dimensions: z.number().int().positive().describe('Embedding vector dimensions'),
  tokens: z.number().int().nonnegative().optional().describe('Estimated tokens in the converted document'),
})

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export const ingestRoutes = new Hono<{ Bindings: Env }>()

ingestRoutes.post(
  '/ingest',
  describeRoute({
    tags: ['Ingestion'],
    summary: 'Ingest a PDF into the vector database',
    description:
      'Converts a PDF to Markdown with Workers AI, splits the text into chunks, embeds every chunk with `@cf/baai/bge-m3`, and stores the vectors in Cloudflare Vectorize.',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                format: 'binary',
                description: 'The PDF document to ingest',
              },
            },
            required: ['file'],
          },
        },
        'application/pdf': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
    responses: {
      200: {
        description: 'The PDF was chunked, embedded, and stored',
        content: {
          'application/json': {
            schema: resolver(ingestResponseSchema),
          },
        },
      },
      400: {
        description: 'Missing or invalid upload',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      413: {
        description: 'The PDF is too large or produces too many chunks',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      415: {
        description: 'Unsupported content type or file type',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      422: {
        description: 'The PDF could not be converted or contains no text',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      500: {
        description: 'Embedding or Vectorize request failed',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    try {
      const file = await readPdf(c)
      const result = await ingestPdf(c.env, file)

      return c.json(result, 200)
    } catch (error) {
      if (error instanceof IngestError) {
        return c.json({ error: error.code, message: error.message }, error.status)
      }

      console.error(error)

      return c.json(
        {
          error: 'Failed to ingest document',
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      )
    }
  },
)

async function readPdf(c: Context<{ Bindings: Env }>): Promise<File> {
  const contentType = (c.req.header('content-type') ?? '').toLowerCase()

  if (contentType.startsWith('application/pdf')) {
    const buffer = await c.req.arrayBuffer()
    const filename = c.req.query('filename') ?? 'document.pdf'

    return new File([buffer], filename, { type: 'application/pdf' })
  }

  if (!contentType.startsWith('multipart/form-data')) {
    throw new IngestError(
      'Unsupported content type. Send the PDF as multipart/form-data with a "file" field, or as a raw application/pdf body.',
      'UNSUPPORTED_CONTENT_TYPE',
      415,
    )
  }

  let form: FormData

  try {
    form = await c.req.formData()
  } catch {
    throw new IngestError('Could not parse the multipart request body.', 'INVALID_MULTIPART')
  }

  const entry = form.get('file')

  if (!(entry instanceof File)) {
    throw new IngestError('The multipart form must contain a "file" field.', 'MISSING_FILE')
  }

  if (entry.size === 0) {
    throw new IngestError('The uploaded PDF is empty.', 'EMPTY_FILE')
  }

  const looksLikePdf =
    entry.type === 'application/pdf' || entry.name.toLowerCase().endsWith('.pdf')

  if (!looksLikePdf) {
    throw new IngestError('Only PDF files are supported.', 'UNSUPPORTED_FILE_TYPE', 415)
  }

  return entry
}
