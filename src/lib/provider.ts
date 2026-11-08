import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export const provider = createOpenAICompatible({
  name: 'openrouter',
  apiKey: process.env.PROVIDER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  includeUsage: true,
})
