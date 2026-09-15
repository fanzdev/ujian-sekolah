import type { FetchFn } from './model-fetcher.ts'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  maxTokens: number
  temperature: number
}

export interface AiChatClient {
  chat(request: ChatRequest, timeoutMs: number): Promise<string>
}

function extractContent(payload: unknown): string {
  const root = (payload ?? {}) as Record<string, unknown>
  const choices = Array.isArray(root['choices']) ? (root['choices'] as unknown[]) : []
  const first = (choices[0] ?? {}) as Record<string, unknown>
  const message = (first['message'] ?? {}) as Record<string, unknown>
  const content = message['content']
  if (typeof content === 'string' && content.trim() !== '') return content
  if (Array.isArray(content)) {
    const text = content
      .map((part) => ((part ?? {}) as Record<string, unknown>)['text'])
      .filter((t): t is string => typeof t === 'string')
      .join('')
    if (text.trim() !== '') return text
  }
  throw new Error('Format respons AI tidak valid.')
}

export function createClient(baseURL: string, apiKey: string, fetchFn: FetchFn = fetch): AiChatClient {
  const endpoint = `${baseURL}/chat/completions`
  return {
    async chat(request: ChatRequest, timeoutMs: number): Promise<string> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 1000))
      try {
        const res = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxTokens,
            temperature: request.temperature,
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        let body: unknown = null
        try {
          body = await res.json()
        } catch {
          throw new Error('Respons AI bukan JSON valid.')
        }
        return extractContent(body)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
