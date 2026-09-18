import { createClient } from 'npm:@supabase/supabase-js@2'
import { alwaysIncludeCors, resolveCorsHeaders, error, json } from '../_shared/cors.ts'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type Payload = {
  feature?: string
  messages?: ChatMessage[]
  maxTokens?: number
  temperature?: number
}

type AiConfigPayload = {
  feature: 'save-ai-config'
  config: {
    provider: string
    baseUrl: string
    model: string
    apiKey: string
    temperature: number
  }
}

const ALLOWED_FEATURES = [
  'generate-questions',
  'explain-question',
  'grade-essay',
  'analyze-exam',
  'generate-remedial',
  'generate-enrichment',
  'improve-question',
  'extract-key-concepts',
  'match-cognitive-level',
]

const FEATURE_MAX_TOKENS: Record<string, number> = {
  'generate-questions': 4000,
  'explain-question': 800,
  'grade-essay': 600,
  'analyze-exam': 1000,
  'generate-remedial': 1500,
  'generate-enrichment': 1500,
  'improve-question': 1000,
  'extract-key-concepts': 1200,
  'match-cognitive-level': 400,
}

const FEATURE_DEFAULT_TEMP: Record<string, number> = {
  'generate-questions': 0.8,
  'analyze-exam': 0.3,
  'grade-essay': 0.3,
}

function getEnv(key: string): string | undefined {
  const value = Deno.env.get(key)
  return value === undefined || value === '' ? undefined : value
}

function numEnv(key: string, fallback: number): number {
  const raw = Number(getEnv(key) ?? '')
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

function hashPrompt(messages: ChatMessage[]): string {
  const seed = JSON.stringify(messages.map((m) => `${m.role}:${m.content.slice(0, 500)}`))
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  }
  return `prompt_${Math.abs(h).toString(36)}`
}

function validMessages(list: unknown): list is ChatMessage[] {
  if (!Array.isArray(list) || list.length === 0 || list.length > 20) return false
  return list.every((m) => {
    if (typeof m !== 'object' || m === null) return false
    const r = (m as Record<string, unknown>).role
    const c = (m as Record<string, unknown>).content
    return (r === 'system' || r === 'user' || r === 'assistant') && typeof c === 'string' && c.length > 0 && c.length <= 12000
  })
}

async function handle(req: Request): Promise<Response> {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const cors = resolveCorsHeaders(req, supabaseUrl)
  if (req.method !== 'POST') return error('Method not allowed', 405, cors)
  try {
    raw = await req.json()
  } catch {
    return error('Body request bukan JSON yang valid.', 400, cors)
  }

  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = getEnv('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || !serviceKey) {
    return error('Layanan AI belum terkonfigurasi dengan benar. Hubungi admin.', 500, cors)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const verifier = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ---- SAVE AI CONFIG (admin only, bypasses RLS via service role) ----
  const pFeature = typeof (raw as Record<string, unknown>)?.feature === 'string'
    ? (raw as Record<string, unknown>).feature
    : ''
  if (pFeature === 'save-ai-config') {
    const p = raw as AiConfigPayload
    const cfg = p.config
    if (!cfg || typeof cfg.provider !== 'string' || !cfg.baseUrl || !cfg.model || !cfg.apiKey) {
      return error('Data konfigurasi tidak lengkap.', 400, cors)
    }
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return error('Sesi tidak valid. Silakan login ulang.', 401, cors)
    const jwt = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
    if (userErr || !userData.user) return error('Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.', 401, cors)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).single()
    const role = (profile as { role?: string } | null)?.role ?? ''
    if (role !== 'admin') return error('Hanya admin yang dapat mengubah konfigurasi AI.', 403, cors)
    const saveConfig = {
      configured: true,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl.trim().replace(/\/+$/, ''),
      apiKey: cfg.apiKey.trim(),
      model: cfg.model.trim(),
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.2,
    }
    await admin.from('system_settings').upsert(
      { key: 'ai', value: saveConfig, updated_at: new Date().toISOString(), updated_by: userData.user.id },
      { onConflict: 'key' },
    )
    return json({ ok: true, message: 'Konfigurasi AI berhasil disimpan.' }, 200, cors)
  }

  // ---- AI CHAT FEATURES ----
  const payload = raw as Payload
  const feature = typeof payload.feature === 'string' ? payload.feature : ''
  if (!ALLOWED_FEATURES.includes(feature)) return error('Fitur AI tidak dikenal.', 400, cors)
  if (!validMessages(payload.messages)) return error('Pesan AI tidak valid atau terlalu besar.', 400, cors)

  const maxTokens = payload.maxTokens !== undefined
    ? Math.min(FEATURE_MAX_TOKENS[feature] ?? 2000, Math.max(100, Math.floor(payload.maxTokens)))
    : FEATURE_MAX_TOKENS[feature] ?? 1500
  const temperature = payload.temperature !== undefined
    ? Number(payload.temperature)
    : FEATURE_DEFAULT_TEMP[feature] ?? 0.7
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1.5) {
    return error('Temperature tidak valid.', 400, cors)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return error('Sesi tidak valid. Silakan login ulang.', 401, cors)
  const jwt = authHeader.replace('Bearer ', '')

  const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
  if (userErr || !userData.user) return error('Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.', 401, cors)

  const { data: profile } = await admin.from('profiles').select('role, is_active').eq('id', userData.user.id).single()
  const role = (profile as { role?: string } | null)?.role ?? ''
  const active = (profile as { is_active?: boolean } | null)?.is_active ?? false
  if (!active) return error('Akun tidak aktif.', 403, cors)
  if (role !== 'admin' && role !== 'teacher') return error('Fitur Veyra AI hanya untuk guru dan admin.', 403, cors)

  const hourlyLimit = numEnv('AI_HOURLY_LIMIT', 30)
  const monthlyLimit = numEnv('AI_MONTHLY_LIMIT', 500)
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { count: hourCount } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', userData.user.id)
    .like('action', 'VEYRA_AI_%')
    .gte('created_at', hourAgo)
  if ((hourCount ?? 0) >= hourlyLimit) {
    return error('Kuota AI per jam telah habis. Coba lagi nanti.', 429, cors)
  }

  const { count: monthCount } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', userData.user.id)
    .like('action', 'VEYRA_AI_%')
    .gte('created_at', monthStart)
  if ((monthCount ?? 0) >= monthlyLimit) {
    return error('Kuota AI bulan ini telah habis.', 429, cors)
  }

  const { data: aiConfig, error: configErr } = await admin.rpc('get_ai_config')
  if (configErr || !aiConfig || !(aiConfig as { configured?: boolean }).configured) {
    return error('Layanan AI belum dikonfigurasi. Harap hubungi admin untuk mengatur provider AI di halaman Veyra AI.', 503, cors)
  }

  const cfg = aiConfig as { baseUrl?: string; apiKey?: string; model?: string; temperature?: number }
  const baseURL = (cfg.baseUrl ?? '').replace(/\/+$/, '')
  const apiKey = cfg.apiKey
  const model = cfg.model ?? 'gemini-2.5-flash'
  const configTemp = typeof cfg.temperature === 'number' ? cfg.temperature : undefined
  if (!baseURL || !apiKey || !model) {
    return error('Konfigurasi AI tidak lengkap. Harap hubungi admin.', 503, cors)
  }

  const promptHash = hashPrompt(payload.messages)
  const featureLabel = feature.toUpperCase().replace(/-/g, '_')

  let content = ''
  let tokensInput = 0
  let tokensOutput = 0

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    try {
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: payload.messages,
          max_tokens: maxTokens,
          temperature: configTemp !== undefined ? configTemp : temperature,
          response_format: feature === 'generate-questions' || feature === 'extract-key-concepts'
            ? { type: 'json_object' }
            : undefined,
        }),
      })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return error('Kunci AI server ditolak provider. Hubungi admin.', 502, cors)
        if (res.status === 429) return error('Provider AI sedang sibuk (rate limit). Coba lagi nanti.', 502, cors)
        return error('Provider AI gagal memproses permintaan. Coba lagi nanti.', 502, cors)
      }
      const parsed = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const text = parsed.choices?.[0]?.message?.content
      if (typeof text !== 'string' || text.trim() === '') {
        return error('AI mengembalikan respons kosong. Coba lagi.', 502, cors)
      }
      content = text
      tokensInput = Number(parsed.usage?.prompt_tokens ?? 0)
      tokensOutput = Number(parsed.usage?.completion_tokens ?? 0)
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return error('AI kehabisan waktu. Coba lagi dengan materi lebih singkat.', 504, cors)
    }
    return error('Gagal menghubungi provider AI. Periksa koneksi lalu coba lagi.', 502, cors)
  }

  try {
    await admin.from('audit_logs').insert({
      actor_id: userData.user.id,
      actor_role: role,
      action: `VEYRA_AI_${featureLabel}`,
      resource: 'veyra_ai',
      resource_id: null,
      metadata: { feature, chars: content.length, tokens_input: tokensInput, tokens_output: tokensOutput },
    })
    await admin.from('ai_generations').insert({
      tenant_id: userData.user.id,
      feature,
      prompt_hash: promptHash,
      model_used: model,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      response_text: content.slice(0, 8000),
      status: 'success',
    })
  } catch {
    console.warn('[ai-proxy] audit gagal dicatat')
  }

  return json({ ok: true, content }, 200, cors)
}

Deno.serve(alwaysIncludeCors(handle))
