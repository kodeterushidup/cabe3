import type { Env } from './env'
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embedTexts } from './embeddings'

export interface DocumentMatch {
  id: string
  score: number
  documentId: string | null
  source: string | null
  chunkIndex: number | null
  text: string | null
}

export interface DocumentSearchResult {
  query: string
  topK: number
  embeddingModel: string
  count: number
  results: DocumentMatch[]
}

export async function searchDocuments(
  env: Env,
  query: string,
  topK: number,
  minScore?: number,
): Promise<DocumentSearchResult> {
  const [embedding] = await embedTexts(env, [query])

  if (!embedding) {
    throw new Error('Workers AI returned no embedding for the query.')
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected a ${EMBEDDING_DIMENSIONS}-dimension query embedding, but got ${embedding.length}.`,
    )
  }

  const response = await env.VECTORIZE.query(embedding, {
    topK,
    returnMetadata: 'all',
    returnValues: false,
  })

  const results = response.matches
    .map((match) => ({
      id: match.id,
      score: match.score,
      documentId: asString(match.metadata?.documentId),
      source: asString(match.metadata?.source),
      chunkIndex: asNumber(match.metadata?.chunkIndex),
      text: asString(match.metadata?.text),
    }))
    .filter((match) => minScore === undefined || match.score >= minScore)

  return {
    query,
    topK,
    embeddingModel: EMBEDDING_MODEL,
    count: results.length,
    results,
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}
