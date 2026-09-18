import type {
  AiProvider,
  AiGenerationResult,
  AiFeature,
  AiMessage,
} from './interface'
import type { AiProviderName } from './interface'

export class AiProviderRouter implements AiProvider {
  readonly name = 'Router'
  readonly modelId = 'multi-provider'

  private readonly providers: AiProvider[]
  private readonly order: AiProviderName[]
  private readonly lastResult: Map<string, AiGenerationResult> = new Map()

  constructor(providers: AiProvider[], order: AiProviderName[] = ['gemini', 'openrouter', 'groq']) {
    this.providers = providers
    this.order = order
  }

  async generate(options: {
    messages: AiMessage[]
    maxTokens?: number
    temperature?: number
    feature: AiFeature
    tenantId: string
  }): Promise<AiGenerationResult> {
    const { messages, maxTokens = 2000, temperature = 0.7, feature, tenantId } = options
    const cacheKey = `${tenantId}:${feature}`

    let lastError: Error | null = null

    for (const providerName of this.order) {
      const provider = this.providers.find((p) => p.name.toLowerCase() === providerName.toLowerCase())
      if (!provider) continue

      try {
        const result = await provider.generate({
          messages,
          maxTokens,
          temperature,
          feature,
          tenantId,
        })
        this.lastResult.set(cacheKey, result)
        return result
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.warn(`[AiProviderRouter] ${providerName} failed:`, lastError.message)
        continue
      }
    }

    throw new Error(lastError?.message ?? 'Semua provider AI gagal. Periksa koneksi dan konfigurasi.')
  }

  getLastResult(feature: AiFeature, tenantId: string): AiGenerationResult | undefined {
    return this.lastResult.get(`${tenantId}:${feature}`)
  }
}
