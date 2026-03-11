import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'

type ProviderType = 'openai' | 'anthropic'

interface ResolvedConfig {
  type: ProviderType
  apiKey: string
  model: string
  baseUrl?: string
}

function resolveConfig(): ResolvedConfig {
  const type = process.env.AI_PROVIDER as string | undefined
  const apiKey = process.env.AI_API_KEY
  const model = process.env.AI_MODEL
  const baseUrl = process.env.AI_BASE_URL

  if (!type) {
    throw new Error('AI_PROVIDER is required. Set it to "openai" or "anthropic" in your .env file.')
  }

  if (type !== 'openai' && type !== 'anthropic') {
    throw new Error(`AI_PROVIDER must be "openai" or "anthropic", got "${type}".`)
  }

  if (!apiKey) {
    throw new Error('AI_API_KEY is required. Set it in your .env file.')
  }

  return { type, apiKey, model: model || 'gpt-4o', baseUrl }
}

const config = resolveConfig()

export function getModel(): LanguageModel {
  switch (config.type) {
    case 'openai': {
      const instance = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
      })
      return instance.chat(config.model)
    }
    case 'anthropic': {
      const instance = createAnthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
      })
      return instance(config.model)
    }
  }
}

export function getReasoningEffort(): string | undefined {
  return process.env.AI_REASONING_EFFORT
}
