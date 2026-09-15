export interface AiProvider {
  index: number
  baseURL: string
  apiKey: string
  label: string
}

export interface DiscoveryResult {
  providers: AiProvider[]
  warnings: string[]
}

export type EnvReader = (key: string) => string | undefined

const KNOWN_HOSTS: { match: string; name: string }[] = [
  { match: 'openrouter', name: 'OpenRouter' },
  { match: 'unorouter', name: 'UnoRouter' },
  { match: 'groq', name: 'Groq' },
  { match: 'cerebras', name: 'Cerebras' },
  { match: 'sambanova', name: 'SambaNova' },
  { match: 'generativelanguage', name: 'Gemini' },
  { match: 'pollinations', name: 'Pollinations' },
  { match: 'huggingface', name: 'HuggingFace' },
  { match: 'together', name: 'Together' },
  { match: 'fireworks', name: 'Fireworks' },
  { match: 'deepinfra', name: 'DeepInfra' },
  { match: 'novita', name: 'Novita' },
  { match: 'siliconflow', name: 'SiliconFlow' },
  { match: 'cohere', name: 'Cohere' },
  { match: 'mistral', name: 'Mistral' },
  { match: 'deepseek', name: 'DeepSeek' },
  { match: 'azure', name: 'AzureOpenAI' },
  { match: 'api.openai.com', name: 'OpenAI' },
]

export function labelForProvider(baseURL: string, num: string): string {
  let host = ''
  try {
    host = new URL(baseURL).hostname.toLowerCase()
  } catch {
    host = baseURL.toLowerCase()
  }
  for (const known of KNOWN_HOSTS) {
    if (host.includes(known.match)) return `${known.name}-${num}`
  }
  return `Provider-${num}`
}

export function discoverProviders(getEnv: EnvReader): DiscoveryResult {
  const providers: AiProvider[] = []
  const warnings: string[] = []
  for (let i = 1; i <= 99; i++) {
    const num = String(i).padStart(2, '0')
    const rawBase = getEnv(`AI_BASE_URL_${num}`)
    if (rawBase === undefined || rawBase.trim() === '') continue
    const rawKey = getEnv(`AI_API_KEY_${num}`)
    if (rawKey === undefined || rawKey.trim() === '') {
      warnings.push(`AI_BASE_URL_${num} tanpa pasangan AI_API_KEY_${num}: provider dilewati.`)
      continue
    }
    providers.push({
      index: i,
      baseURL: rawBase.trim().replace(/\/+$/, ''),
      apiKey: rawKey.trim(),
      label: labelForProvider(rawBase.trim(), num),
    })
  }
  return { providers, warnings }
}
