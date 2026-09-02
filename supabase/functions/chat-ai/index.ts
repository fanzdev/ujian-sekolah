import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, error } from '../_shared/cors.ts'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  model?: string
  max_tokens?: number
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'meta-llama/llama-3.2-3b-instruct:free'

class KeyFailure extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function callOpenRouter(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
  let res: Response
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'SMK AL-FATA CBT - Chat AI',
        'HTTP-Referer': 'https://smk-alfata-cbt.local',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
      }),
    })
  } catch (e) {
    throw new KeyFailure(`jaringan: ${e instanceof Error ? e.message : 'unknown'}`, 0)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let reason = body.slice(0, 300)
    try {
      const j = JSON.parse(body)
      reason = j?.error?.message ?? j?.error ?? reason
    } catch {
      // keep raw
    }
    throw new KeyFailure(`HTTP ${res.status}: ${reason}`, res.status)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new KeyFailure('Empty reply', 502)
  return content
}

function isRetryable(f: KeyFailure): boolean {
  return [0, 401, 402, 403, 408, 429].includes(f.status) || f.status >= 500
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return error('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return error('Missing authorization', 401)
  const jwt = authHeader.replace('Bearer ', '')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey) return error('Service misconfigured', 500)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const verifier = createClient(supabaseUrl, anonKey ?? serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
  if (userErr || !userData.user) return error('Invalid token', 401)

  const { data: profile } = await admin.from('profiles').select('role, is_active').eq('id', userData.user.id).single()
  if (!profile || !profile.is_active) return error('Akun tidak aktif', 403)

  let body: ChatRequest
  try {
    body = await req.json()
  } catch {
    return error('Invalid JSON')
  }
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.content === 'string' && m.content.trim()) : []
  if (messages.length === 0) return error('messages wajib diisi')
  const maxTokens = Math.min(2000, Math.max(10, Number(body.max_tokens ?? 600)))

  const { data: cfgRow } = await admin.from('system_settings').select('value').eq('key', 'ai').maybeSingle()
  const cfg = ((cfgRow?.value as Record<string, unknown>) ?? {}) as { model?: string; models?: string[] }
  const globalModels: string[] = Array.isArray(cfg.models) && cfg.models.length ? cfg.models.filter((m) => typeof m === 'string' && m.trim()) : cfg.model ? [String(cfg.model)] : []
  const effectiveModels = globalModels.length ? globalModels : [DEFAULT_MODEL]

  let requestedModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : ''
  if (requestedModel && globalModels.length && !globalModels.includes(requestedModel)) {
    requestedModel = ''
  }
  const modelsToTry = requestedModel ? [requestedModel] : effectiveModels

  const { data: dbKeys } = await admin
    .from('ai_provider_keys')
    .select('id, api_key, model')
    .eq('provider', 'openrouter')
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  type PoolItem = { id: string | null; apiKey: string; model: string | null }
  const pool: PoolItem[] = ((dbKeys ?? []) as { id: string; api_key: string; model: string | null }[]).map((k) => ({ id: k.id, apiKey: k.api_key, model: k.model }))

  const envKey = Deno.env.get('OPENROUTER_API_KEY')
  if (pool.length === 0 && envKey) {
    pool.push({ id: null, apiKey: envKey, model: Deno.env.get('AI_MODEL') ?? null })
  }
  if (pool.length === 0) return error('Belum ada API Key OpenRouter. Tambahkan di Pengaturan Admin → AI Grading.', 503)

  const failures: string[] = []
  let reply = ''
  let usedModel = ''
  outer: for (const [i, candidate] of pool.entries()) {
    const candidatesModels = candidate.model ? [candidate.model] : modelsToTry
    for (const model of candidatesModels) {
      try {
        reply = await callOpenRouter(candidate.apiKey, model, messages, maxTokens)
        usedModel = model
        if (candidate.id) {
          void admin.from('ai_provider_keys').update({ last_used_at: new Date().toISOString(), last_error: null }).eq('id', candidate.id)
        }
        break outer
      } catch (e) {
        const f = e instanceof KeyFailure ? e : new KeyFailure(String(e), 500)
        failures.push(`Key#${i + 1} · ${model}: ${f.message}`)
        if (candidate.id) {
          void admin.from('ai_provider_keys').update({ last_error: f.message }).eq('id', candidate.id)
        }
        if (!isRetryable(f)) continue
      }
    }
  }

  if (!reply) {
    return error(`Semua API Key gagal (${failures.length} dicoba). Detail: ${failures.join(' | ')}`, 502)
  }

  return json({ ok: true, reply, model: usedModel })
})
