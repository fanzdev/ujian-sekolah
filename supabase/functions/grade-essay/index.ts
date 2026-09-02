import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, error } from '../_shared/cors.ts'

interface GradeRequest {
  attempt_id: string
  question_id: string
}

interface AiResult {
  score: number
  feedback: string
  confidence: number
}

interface PoolKey {
  id: string | null
  apiKey: string
  model: string | null
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'meta-llama/llama-3.2-3b-instruct:free'

function buildPrompt(args: {
  questionText: string
  rubric?: string | null
  maxPoints: number
  answer: string
}): string {
  const { questionText, rubric, maxPoints, answer } = args
  return `Anda adalah guru pemeriksa jawaban essay ujian sekolah SMK.

Tugas: nilailah jawaban siswa berikut secara adil dan objektif.

SOAL:
${questionText}

${rubric ? `RUBRIK PENILAIAN:\n${rubric}\n` : ''}
JAWABAN SISWA:
"""
${answer}
"""

ATURAN:
- Skor maksimal: ${maxPoints} poin.
- Nilai proporsional terhadap kelengkapan dan kebenaran konsep.
- Feedback singkat (1-3 kalimat) dalam Bahasa Indonesia, sebutkan kelebihan & kekurangan.
- Balas HANYA dengan JSON valid tanpa penjelasan tambahan:
{"score": <angka>, "feedback": "<teks>", "confidence": <0.0-1.0>}`
}

function parseAiJson(raw: string): AiResult | null {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    const score = Number(parsed.score)
    if (!Number.isFinite(score)) return null
    return {
      score,
      feedback: String(parsed.feedback ?? ''),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
    }
  } catch {
    return null
  }
}

class KeyFailure extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function callOpenRouter(apiKey: string, model: string, prompt: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'SMK AL-FATA CBT',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'You are a strict but fair exam grader. Reply with JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    })
  } catch (e) {
    throw new KeyFailure(`jaringan: ${e instanceof Error ? e.message : 'unknown'}`, 0)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let reason = body.slice(0, 200)
    try {
      const j = JSON.parse(body)
      reason = j?.error?.message ?? reason
    } catch {
      // keep raw text
    }
    throw new KeyFailure(`HTTP ${res.status}: ${reason}`, res.status)
  }

  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

function isRetryableFailure(f: KeyFailure): boolean {
  // rate limit, quota/credit habis, key invalid, error server & jaringan → coba key berikutnya
  return [0, 401, 402, 403, 408, 429].includes(f.status) || f.status >= 500
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return error('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return error('Missing authorization', 401)
  const jwt = authHeader.replace('Bearer ', '')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey) return error('Service misconfigured', 500)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const verifier = createClient(supabaseUrl, anonKey ?? serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
  if (userErr || !userData.user) return error('Invalid token', 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .single()
  if (!profile?.is_active || !['admin', 'teacher'].includes(profile.role)) {
    return error('Hanya guru/admin yang diizinkan.', 403)
  }

  let body: GradeRequest
  try {
    body = await req.json()
  } catch {
    return error('Invalid JSON')
  }
  if (!body.attempt_id || !body.question_id) return error('attempt_id & question_id wajib.')

  const { data: ctx, error: ctxErr } = await admin.rpc('get_attempt_payload', {
    p_attempt_id: body.attempt_id,
  })
  if (ctxErr) return error(ctxErr.message, 400)
  const payload = typeof ctx === 'string' ? JSON.parse(ctx) : ctx

  if (profile.role === 'teacher' && !payload?.exam) {
    return error('Akses ditolak.', 403)
  }

  const question = payload.questions?.[body.question_id]
  if (!question || question.type !== 'essay') return error('Soal essay tidak ditemukan.')
  const answer = payload.answers?.[body.question_id]
  if (!answer || String(answer).trim().length === 0) {
    return json({ ok: false, reason: 'Siswa belum menjawab soal ini.' }, 422)
  }

  const { data: qrow } = await admin
    .from('questions')
    .select('text, scoring_rule')
    .eq('id', body.question_id)
    .single()

  const prompt = buildPrompt({
    questionText: qrow?.text ?? String(question.text ?? ''),
    rubric: qrow?.scoring_rule?.rubric ?? null,
    maxPoints: Number(question.points ?? 10),
    answer: String(answer),
  })

  // ---------- Bangun pool kunci: DB (urutan prioritas) + fallback env ----------
  const { data: configRow } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'ai')
    .maybeSingle()
  const aiConfig = ((configRow?.value as Record<string, unknown>) ?? {}) as {
    provider?: string
    model?: string
    models?: string[]
  }
  const globalModels: string[] = Array.isArray(aiConfig.models) && aiConfig.models.length
    ? (aiConfig.models as string[]).filter((m) => typeof m === 'string' && m.trim())
    : aiConfig.model
      ? [aiConfig.model as string]
      : []
  const effectiveGlobalModels = globalModels.length ? globalModels : [DEFAULT_MODEL]

  const { data: dbKeys } = await admin
    .from('ai_provider_keys')
    .select('id, api_key, model')
    .eq('provider', 'openrouter')
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  const pool: PoolKey[] = ((dbKeys ?? []) as { id: string; api_key: string; model: string | null }[]).map(
    (k) => ({ id: k.id, apiKey: k.api_key, model: k.model }),
  )

  const envKey = Deno.env.get('OPENROUTER_API_KEY')
  if (pool.length === 0 && envKey) {
    pool.push({ id: null, apiKey: envKey, model: Deno.env.get('AI_MODEL') ?? null })
  }

  if (pool.length === 0) {
    return error(
      'Belum ada API Key OpenRouter. Tambahkan di menu Pengaturan Admin → tab AI Grading.',
      503,
    )
  }

  // ---------- Rotasi otomatis antar kunci + model gratis ----------
  const failures: string[] = []
  let raw = ''
  outer: for (const [i, candidate] of pool.entries()) {
    const modelsForKey: string[] = candidate.model
      ? [candidate.model]
      : effectiveGlobalModels
    for (const model of modelsForKey) {
      try {
        raw = await callOpenRouter(candidate.apiKey, model, prompt)
        if (candidate.id) {
          void admin
            .from('ai_provider_keys')
            .update({ last_used_at: new Date().toISOString(), last_error: null })
            .eq('id', candidate.id)
        }
        break outer
      } catch (e) {
        const f = e instanceof KeyFailure ? e : new KeyFailure(String(e), 500)
        failures.push(`Key#${i + 1} · ${model}: ${f.message}`)
        if (candidate.id) {
          void admin.from('ai_provider_keys').update({ last_error: f.message }).eq('id', candidate.id)
        }
        if (!isRetryableFailure(f)) {
          continue
        }
      }
    }
  }

  if (!raw) {
    return error(
      `Semua API Key OpenRouter gagal (${failures.length} dicoba). Detail: ${failures.join(' | ')}`,
      502,
    )
  }

  const parsed = parseAiJson(raw)
  if (!parsed) return error('Gagal memparsing respons AI.', 502)
  const max = Number(question.points ?? 10)
  const aiResult: AiResult = { ...parsed, score: Math.min(max, Math.max(0, parsed.score)) }

  await admin.from('essay_grades').upsert({
    attempt_id: body.attempt_id,
    question_id: body.question_id,
    ai_score: aiResult.score,
    ai_feedback: aiResult.feedback,
    ai_confidence: aiResult.confidence,
    ai_provider: 'openrouter',
    status: 'ai_graded',
  })

  return json({ ok: true, suggestion: aiResult })
})
