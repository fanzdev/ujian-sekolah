import type {
  AiProvider,
  AiGenerationResult,
  AiFeature,
  AiMessage,
} from './interface'

// const GroqModels: Record<string, string> = {
  // 'groq/qwen3-30b': 'qwen3-30b',
  // 'groq/llama-3.3-70b': 'llama-3.3-70b',
//}

type OpenAICompatibleRes = {
  choices?: Array<{
    message?: { role?: string; content?: string }
    finish_reason?: string
    index?: number
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export class GroqProvider implements AiProvider {
  readonly name = 'Groq'
  readonly modelId = 'groq/qwen3-30b'

  private readonly apiKey: string
  private readonly defaultModel: string

  constructor(opts: { apiKey: string; model?: string }) {
    this.apiKey = opts.apiKey
    this.defaultModel = opts.model ?? 'qwen3-30b'
  }

  async generate(options: {
    messages: AiMessage[]
    maxTokens?: number
    temperature?: number
    feature: AiFeature
    tenantId: string
  }): Promise<AiGenerationResult> {
    const { messages, maxTokens = 2000, temperature = 0.7 } = options

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error(`Groq error ${res.status}: ${txt.slice(0, 200)}`)
    }

    const data = (await res.json()) as OpenAICompatibleRes
    const text = data.choices?.[0]?.message?.content ?? ''
    if (!text.trim()) throw new Error('Groq returned empty response')

    return {
      content: text,
      tokensInput: data.usage?.prompt_tokens ?? 0,
      tokensOutput: data.usage?.completion_tokens ?? 0,
      model: this.defaultModel,
    }
  }
}
