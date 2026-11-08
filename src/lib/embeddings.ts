import type { Env } from './env'

export const EMBEDDING_MODEL = '@cf/baai/bge-m3'
export const EMBEDDING_DIMENSIONS = 1024

const EMBED_BATCH_SIZE = 20

export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []

  for (let index = 0; index < texts.length; index += EMBED_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBED_BATCH_SIZE)
    const response = await env.AI.run(EMBEDDING_MODEL, { text: batch })

    if (!response?.data || response.data.length !== batch.length) {
      throw new Error('Workers AI returned an unexpected embedding response.')
    }

    embeddings.push(...response.data)
  }

  return embeddings
}
