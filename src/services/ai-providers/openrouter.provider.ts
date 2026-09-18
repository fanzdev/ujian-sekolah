import type {
  AiProvider,
  AiGenerationResult,
  AiFeature,
  AiMessage,
} from './interface'

// const OpenRouterModels: Record<string, string> = {
  // 'openrouter/gemini-2.5-flash': 'google/gemini-2.5-flash',
  // 'openrouter/gemma-3-27b': 'google/gemma-3-27b',
  // 'openrouter/qwen3-30b': 'qwen/qwen3-30b',
//}

type OpenAICompatibleRes = {
  choices?: Array<{
    message?: { role?: string; content?: string }
    finish_reason?: string
    index?: number
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export class OpenRouterProvider implements AiProvider {
  readonly name = 'OpenRouter'
  readonly modelId = 'openrouter/gemini-2.5-flash'

  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultModel: string

  constructor(opts: {
    apiKey: string
    baseURL?: string
    model?: string
  }) {
    this.apiKey = opts.apiKey
    this.baseURL = (opts.baseURL ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    this.defaultModel = opts.model ?? 'google/gemini-2.5-flash-free'
  }

  async generate(options: {
    messages: AiMessage[]
    maxTokens?: number
    temperature?: number
    feature: AiFeature
    tenantId: string
  }): Promise<AiGenerationResult> {
    const { messages, maxTokens = 2000, temperature = 0.7 } = options

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': globalThis.location?.origin ?? 'https://alfata-cbt.vercel.app',
        'X-Title': 'Veyra CBT AI',
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`OpenRouter error ${res.status}: ${txt.slice(0, 200)}`)
    }

    const data = (await res.json()) as OpenAICompatibleRes
    const text = data.choices?.[0]?.message?.content ?? ''
    if (!text.trim()) throw new Error('OpenRouter returned empty response')

    return {
      content: text,
      tokensInput: data.usage?.prompt_tokens ?? 0,
      tokensOutput: data.usage?.completion_tokens ?? 0,
      model: this.defaultModel,
    }
  }
}
