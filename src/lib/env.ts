export interface MarkdownDocument {
  name: string
  blob: Blob
}

export interface MarkdownConversion {
  id: string
  name: string
  format: 'markdown' | 'text' | 'error'
  mimetype: string
  tokens?: number
  data?: string
  error?: string
}

export interface EmbeddingResponse {
  shape?: number[]
  data: number[][]
}

export interface WorkersAI {
  run(model: string, inputs: Record<string, unknown>): Promise<EmbeddingResponse>
  toMarkdown(files: MarkdownDocument): Promise<MarkdownConversion>
  toMarkdown(files: MarkdownDocument[]): Promise<MarkdownConversion[]>
}

export interface VectorizeVector {
  id: string
  values: number[]
  metadata?: VectorizeMetadata
}

export type VectorizeMetadata = Record<string, string | number | boolean>

export interface VectorizeMatch {
  id: string
  score: number
  values?: number[]
  metadata?: VectorizeMetadata
  namespace?: string
}

export interface VectorizeQueryOptions {
  topK?: number
  returnValues?: boolean
  returnMetadata?: 'none' | 'indexed' | 'all'
  filter?: Record<string, unknown>
}

export interface VectorizeQueryResponse {
  matches: VectorizeMatch[]
  count?: number
}

export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<{ mutationId?: string; count?: number }>
  query(
    vector: number[],
    options?: VectorizeQueryOptions,
  ): Promise<VectorizeQueryResponse>
}

export interface D1Result<T = unknown> {
  success: boolean
  results?: T[]
  meta?: Record<string, unknown>
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  run<T = unknown>(): Promise<D1Result<T>>
  all<T = unknown>(): Promise<D1Result<T>>
  first<T = unknown>(): Promise<T | null>
}

export interface D1Database {
  prepare(query: string): D1Statement
  batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>
}

export interface Env {
  AI: WorkersAI
  VECTORIZE: VectorizeIndex
  DB: D1Database
  YOUTUBE_API_KEY?: string
  BASE_URL?: string
  DOKU_API_KEY?: string
  DOKU_CLIENT_ID?: string
  DOKU_IS_PRODUCTION?: string
}

export interface AuthUser {
  id: number
  email: string
  name: string
  quotaRemaining: number
  createdAt: string
}

export type AppEnv = {
  Bindings: Env
  Variables: {
    user: AuthUser
  }
}
