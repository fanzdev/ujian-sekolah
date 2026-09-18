import type {
  AiProvider,
  AiGenerationResult,
  AiFeature,
  AiMessage,
} from './interface'

// const GeminiModels: Record<string, string> = {
  // 'gemini-2.5-flash': 'gemini-2.5-flash',
  // 'gemini-2.0-flash': 'gemini-2.0-flash',
//}

type GeminiRes = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
      role?: string
    }
    finishReason?: string
    index?: number
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

function gMsgToParts(msg: AiMessage): unknown[] {
  return [
    {
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    },
  ]
}

export class GeminiProvider implements AiProvider {
  readonly name = 'Gemini'
  readonly modelId = 'gemini-2.5-flash'

  private readonly apiKey: string
  private readonly baseURL: string

  constructor(opts: { apiKey: string; baseURL?: string }) {
    this.apiKey = opts.apiKey
    this.baseURL = (opts.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
  }

  async generate(options: {
    messages: AiMessage[]
    maxTokens?: number
    temperature?: number
    feature: AiFeature
    tenantId: string
  }): Promise<AiGenerationResult> {
    const { messages, maxTokens = 2000, temperature = 0.7 } = options
    const systemMsg = messages.find((m) => m.role === 'system')
    const chatMsgs = messages.filter((m) => m.role !== 'system')
    const contents = chatMsgs.map(gMsgToParts).flat()

    const safety = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]

    const res = await fetch(
      `${this.baseURL}/models/${this.modelId}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature,
            responseMimeType: 'application/json',
          },
          safetySettings: safety,
          systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        }),
      },
    )

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Gemini error ${res.status}: ${txt.slice(0, 200)}`)
    }

    const data = (await res.json()) as GeminiRes
    const candidate = data.candidates?.[0]
    const text = candidate?.content?.parts?.[0]?.text ?? ''
    if (!text.trim()) throw new Error('Gemini returned empty response')

    return {
      content: text,
      tokensInput: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOutput: data.usageMetadata?.candidatesTokenCount ?? 0,
      model: this.modelId,
    }
  }
}
