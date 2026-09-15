import { createClient } from 'npm:@supabase/supabase-js@2'
import { alwaysIncludeCors, resolveCorsHeaders, error, json } from '../_shared/cors.ts'
import { generateWithFallback } from './lib/manager.ts'
import { createLogger } from './lib/logger.ts'
import { fetchFreeModels } from './lib/model-fetcher.ts'
import { discoverProviders } from './lib/env-parser.ts'
import {
  generateQuestions,
  gradeEssay,
  analyzeResult,
  generateExplanation,
  refineQuestions,
  type GenerateQuestionsOptions,
  type GradeEssayOptions,
  type ExplainOptions,
  type RefineQuestionsOptions,
  type GeneratedQuestion,
} from './lib/features.ts'
import type { ChatMessage } from './lib/client-factory.ts'

type Payload =
  | { action: 'status' }
  | { action: 'generate-questions'; topic: string; options?: GenerateQuestionsOptions }
  | { action: 'refine-questions'; questions: GeneratedQuestion[]; instruction: string; options?: RefineQuestionsOptions }
  | { action: 'grade-essay'; questionText: string; answerText: string; options?: GradeEssayOptions }
  | {
    action: 'analyze-result'
    examTitle: string
    totalQuestions: number
    rows: { score: number; passed: boolean | null }[]
  }
  | {
    action: 'explain'
    questionText: string
    optionsText?: string[]
    correctAnswer?: string
    type?: string
    options?: ExplainOptions
  }

const STAFF_ACTIONS = ['generate-questions', 'refine-questions', 'grade-essay', 'analyze-result', 'explain']

function getEnv(key: string): string | undefined {
  const value = Deno.env.get(key)
  return value === undefined || value === '' ? undefined : value
}

function hourlyLimit(): number {
  const raw = Number(getEnv('AI_HOURLY_LIMIT') ?? '')
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30
}

async function handle(req: Request): Promise<Response> {
  const cors = resolveCorsHeaders(req)
  if (req.method !== 'POST') {
    return error('Method not allowed', 405, cors)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return error('Body request bukan JSON yang valid.', 400, cors)
  }
  if (!payload || typeof payload !== 'object' || !('action' in payload)) {
    return error('Kolom "action" wajib diisi.', 400, cors)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return error('Sesi tidak valid. Silakan login ulang.', 401, cors)
  }
  const jwt = authHeader.replace('Bearer ', '')

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!serviceKey || !supabaseUrl) {
    console.error('[ai-proxy] secrets platform tidak lengkap: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL')
    return error('Layanan AI belum terkonfigurasi dengan benar. Hubungi admin.', 500, cors)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const verifier = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return error('Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.', 401, cors)
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role ?? ''
  const active = (profile as { is_active?: boolean } | null)?.is_active ?? false
  if (!active) return error('Akun tidak aktif.', 403, cors)

  const log = createLogger({ production: Deno.env.get('DENO_DEPLOYMENT_ID') !== undefined })

  try {
    if (payload.action === 'status') {
      const { providers } = discoverProviders(getEnv)
      const details = []
      for (const p of providers) {
        const models = await fetchFreeModels(p.baseURL, p.apiKey, fetch, 8000, log, p.label).catch(() => [] as string[])
        details.push({ index: p.index, label: p.label, freeModels: models.length })
      }
      return json({ ok: true, configured: providers.length > 0, providers: details }, 200, cors)
    }

    if (!STAFF_ACTIONS.includes(payload.action)) return error('Aksi tidak dikenal.', 400, cors)
    if (role !== 'admin' && role !== 'teacher') {
      return error('Fitur AI hanya untuk guru dan admin.', 403, cors)
    }

    const since = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', userData.user.id)
      .like('action', 'AI_%')
      .gte('created_at', since)
    if ((count ?? 0) >= hourlyLimit()) {
      return error('Batas pemakaian AI per jam tercapai. Coba lagi nanti.', 429, cors)
    }

    const generate = (messages: ChatMessage[], maxTokens: number, temperature: number): Promise<string> =>
      generateWithFallback({ messages, maxTokens, temperature }, { getEnv }).then((r) => r.content)

    const audit = async (action: string, resource: string, metadata: Record<string, unknown>): Promise<void> => {
      try {
        await admin.from('audit_logs').insert({
          actor_id: userData.user.id,
          actor_role: role,
          action,
          resource,
          resource_id: null,
          metadata,
        })
      } catch {
        log.warn('Audit AI gagal dicatat.')
      }
    }

    switch (payload.action) {
      case 'generate-questions': {
        const questions = await generateQuestions(generate, payload.topic ?? '', payload.options ?? {})
        await audit('AI_GENERATE', 'question', { topic: (payload.topic ?? '').slice(0, 120), count: questions.length })
        return json({ ok: true, questions }, 200, cors)
      }
      case 'refine-questions': {
        const list = Array.isArray(payload.questions) ? payload.questions : []
        const questions = await refineQuestions(generate, list, payload.instruction ?? '', payload.options ?? {})
        await audit('AI_REFINE', 'question', { instruction: (payload.instruction ?? '').slice(0, 120), count: questions.length })
        return json({ ok: true, questions }, 200, cors)
      }
      case 'grade-essay': {
        const result = await gradeEssay(generate, payload.questionText ?? '', payload.answerText ?? '', payload.options ?? {})
        await audit('AI_GRADE', 'essay_grade', { score: result.score })
        return json({ ok: true, result }, 200, cors)
      }
      case 'analyze-result': {
        const result = await analyzeResult(
          generate,
          { examTitle: payload.examTitle ?? '', rows: Array.isArray(payload.rows) ? payload.rows : [] },
          Number(payload.totalQuestions ?? 0),
        )
        await audit('AI_ANALYZE', 'exam_result', { exam: (payload.examTitle ?? '').slice(0, 120) })
        return json({ ok: true, result }, 200, cors)
      }
      case 'explain': {
        const result = await generateExplanation(
          generate,
          payload.questionText ?? '',
          Array.isArray(payload.optionsText) ? payload.optionsText : [],
          payload.correctAnswer ?? '',
          payload.type ?? '',
          payload.options ?? {},
        )
        await audit('AI_EXPLAIN', 'question', {})
        return json({ ok: true, result }, 200, cors)
      }
      default:
        return error('Aksi tidak dikenal.', 400, cors)
    }
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e))
    return error('Layanan AI sedang tidak tersedia. Coba lagi nanti.', 502, cors)
  }
}

Deno.serve(alwaysIncludeCors(handle))
