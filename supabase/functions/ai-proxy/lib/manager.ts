import { discoverProviders, type EnvReader } from './env-parser.ts'
import { fetchFreeModels, type FetchFn } from './model-fetcher.ts'
import { createClient, type ChatMessage } from './client-factory.ts'
import { createLogger, type Logger } from './logger.ts'

export interface GenerateOptions {
  messages: ChatMessage[]
  systemPrompt?: string | null
  maxTokens?: number
  temperature?: number
  onProviderChange?: (info: { index: number; label: string }) => void
}

export interface AIResult {
  content: string
  model: string
  provider: string
  providerIndex: number
  attempts: number
}

export interface ManagerConfig {
  getEnv: EnvReader
  fetchFn?: FetchFn
  logger?: Logger
  production?: boolean
}

function readNumber(getEnv: EnvReader, key: string, fallback: number): number {
  const raw = getEnv(key)
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function generateWithFallback(options: GenerateOptions, config: ManagerConfig): Promise<AIResult> {
  if (!options || !Array.isArray(options.messages) || options.messages.length === 0) {
    throw new Error('Daftar pesan wajib diisi.')
  }
  const fetchFn = config.fetchFn ?? fetch
  const log = config.logger ?? createLogger({ production: config.production ?? false })
  const timeoutMs = readNumber(config.getEnv, 'AI_REQUEST_TIMEOUT', 15000)
  const retryRaw = Number(config.getEnv('AI_MAX_RETRIES') ?? '')
  const maxRetries = Number.isFinite(retryRaw) && retryRaw >= 0 ? Math.floor(retryRaw) : 2
  const maxModels = Math.min(Math.max(readNumber(config.getEnv, 'AI_MAX_MODELS', 15), 1), 50)
  const maxTokens = Math.min(Math.max(options.maxTokens ?? 1000, 1), 8000)
  const temperature = options.temperature ?? 0.7

  const { providers, warnings } = discoverProviders(config.getEnv)
  for (const warning of warnings) log.warn(warning)
  log.info(`Found ${providers.length} providers`)
  if (providers.length === 0) {
    throw new Error('Tidak ada provider AI yang dikonfigurasi. Tambahkan AI_BASE_URL_01 dan AI_API_KEY_01 pada secrets Edge Function.')
  }

  const failures: string[] = []
  let attempts = 0

  for (const provider of providers) {
    log.info(`Trying ${provider.label}: ${provider.baseURL}`)
    options.onProviderChange?.({ index: provider.index, label: provider.label })
    const models = await fetchFreeModels(provider.baseURL, provider.apiKey, fetchFn, timeoutMs, log, provider.label, maxModels)
    log.info(`Free models found: [${models.join(', ')}]`)
    if (models.length === 0) {
      const reason = `${provider.label} tidak menyediakan model gratis`
      failures.push(reason)
      log.warn(`${provider.label} exhausted, moving to next...`)
      continue
    }
    const client = createClient(provider.baseURL, provider.apiKey, fetchFn)
    const messages: ChatMessage[] = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...options.messages]
      : options.messages
    for (const model of models) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attempts += 1
        log.info(`Trying model: ${model}`)
        try {
          const content = await client.chat({ model, messages, maxTokens, temperature }, timeoutMs)
          log.info(`Success with ${provider.label}, Model: ${model}`)
          return { content, model, provider: provider.label, providerIndex: provider.index, attempts }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          failures.push(`${provider.label}/${model}: ${reason}`)
          log.warn(`Model ${model} failed: ${reason}`)
        }
      }
    }
    log.warn(`${provider.label} exhausted, moving to next...`)
  }

  log.error('All providers and models exhausted')
  throw new Error(`Semua provider AI gagal setelah ${attempts} percobaan. Rincian: ${failures.slice(0, 5).join(' | ')}`)
}
