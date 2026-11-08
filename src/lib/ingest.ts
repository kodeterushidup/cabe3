import type { Env, MarkdownConversion, VectorizeVector } from './env'
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embedTexts } from './embeddings'

export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL }

const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 150
const UPSERT_BATCH_SIZE = 100
const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_CHUNKS = 400

export class IngestError extends Error {
  readonly code: string
  readonly status: 400 | 413 | 415 | 422 | 500

  constructor(
    message: string,
    code: string,
    status: 400 | 413 | 415 | 422 | 500 = 400,
  ) {
    super(message)
    this.name = 'IngestError'
    this.code = code
    this.status = status
  }
}

export interface IngestResult {
  documentId: string
  filename: string
  chunks: number
  vectorIds: string[]
  embeddingModel: string
  dimensions: number
  tokens?: number
}

export async function ingestPdf(env: Env, file: File): Promise<IngestResult> {
  if (file.size === 0) {
    throw new IngestError('The uploaded PDF is empty.', 'EMPTY_FILE')
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new IngestError(
      `The PDF is too large. The maximum size is ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
      'FILE_TOO_LARGE',
      413,
    )
  }

  const buffer = await file.arrayBuffer()
  const documentId = (await sha256Hex(buffer)).slice(0, 32)

  const conversion = await convertToMarkdown(env, file, buffer)

  if (conversion.format === 'error' || !conversion.data) {
    throw new IngestError(
      conversion.error ?? 'Could not convert the PDF to text.',
      'CONVERSION_FAILED',
      422,
    )
  }

  const chunks = chunkText(conversion.data)

  if (chunks.length === 0) {
    throw new IngestError('No extractable text was found in the PDF.', 'NO_TEXT', 422)
  }

  if (chunks.length > MAX_CHUNKS) {
    throw new IngestError(
      `The PDF produced ${chunks.length} chunks, which exceeds the limit of ${MAX_CHUNKS}. Split the document and try again.`,
      'TOO_MANY_CHUNKS',
      413,
    )
  }

  const embeddings = await embedTexts(env, chunks)
  const dimensions = embeddings[0]?.length ?? 0

  if (dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings from ${EMBEDDING_MODEL}, but got ${dimensions}. Recreate the Vectorize index with --dimensions=${dimensions}.`,
    )
  }

  const filename = file.name || 'document.pdf'
  const vectors: VectorizeVector[] = embeddings.map((values, index) => ({
    id: `${documentId}-${String(index).padStart(4, '0')}`,
    values,
    metadata: {
      documentId,
      chunkIndex: index,
      source: filename,
      text: chunks[index],
    },
  }))

  await upsertVectors(env, vectors)

  return {
    documentId,
    filename,
    chunks: chunks.length,
    vectorIds: vectors.map((vector) => vector.id),
    embeddingModel: EMBEDDING_MODEL,
    dimensions,
    tokens: conversion.tokens,
  }
}

async function convertToMarkdown(
  env: Env,
  file: File,
  buffer: ArrayBuffer,
): Promise<MarkdownConversion> {
  let result: MarkdownConversion | MarkdownConversion[]

  try {
    result = await env.AI.toMarkdown({
      name: file.name || 'document.pdf',
      blob: new Blob([buffer], { type: 'application/pdf' }),
    })
  } catch (error) {
    throw new IngestError(
      `Workers AI could not convert the PDF: ${error instanceof Error ? error.message : String(error)}`,
      'CONVERSION_FAILED',
      422,
    )
  }

  return Array.isArray(result) ? result[0] : result
}

async function upsertVectors(env: Env, vectors: VectorizeVector[]): Promise<void> {
  for (let index = 0; index < vectors.length; index += UPSERT_BATCH_SIZE) {
    await env.VECTORIZE.upsert(vectors.slice(index, index + UPSERT_BATCH_SIZE))
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function chunkText(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    return []
  }

  const chunks: string[] = []
  let current = ''

  const flush = (): string => {
    const chunk = current.trim()
    current = ''

    if (chunk) {
      chunks.push(chunk)
    }

    return chunk
  }

  for (const paragraph of normalized.split(/\n{2,}/)) {
    for (const piece of splitParagraph(paragraph.trim(), size)) {
      if (!piece) {
        continue
      }

      if (!current) {
        current = piece
        continue
      }

      if (current.length + 2 + piece.length <= size) {
        current += `\n\n${piece}`
        continue
      }

      const finished = flush()
      const seed = overlap > 0 ? finished.slice(Math.max(0, finished.length - overlap)).trim() : ''

      current = seed && seed !== piece ? `${seed}\n\n${piece}` : piece
    }
  }

  flush()

  return chunks
}

function splitParagraph(paragraph: string, size: number): string[] {
  if (paragraph.length <= size) {
    return [paragraph]
  }

  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [paragraph]
  const parts: string[] = []
  let buffer = ''

  for (const raw of sentences) {
    const sentence = raw.trim()

    if (!sentence) {
      continue
    }

    if (sentence.length > size) {
      if (buffer) {
        parts.push(buffer)
        buffer = ''
      }

      for (let index = 0; index < sentence.length; index += size) {
        parts.push(sentence.slice(index, index + size))
      }

      continue
    }

    if (!buffer) {
      buffer = sentence
    } else if (buffer.length + 1 + sentence.length <= size) {
      buffer += ` ${sentence}`
    } else {
      parts.push(buffer)
      buffer = sentence
    }
  }

  if (buffer) {
    parts.push(buffer)
  }

  return parts
}
