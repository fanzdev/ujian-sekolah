import { supabase } from './client'
import type {
  AnswerValue,
  AttemptPayload,
  AvailableExam,
  SubmitSummary,
  ViolationResponse,
} from '@/types/models'

export async function getServerTimeOffset(): Promise<number> {
  const { data, error } = await supabase.rpc('get_server_time')
  if (error) throw error
  const serverMs = new Date(data as string).getTime()
  return serverMs - Date.now()
}

export async function listAvailableExams(): Promise<AvailableExam[]> {
  const { data, error } = await supabase.rpc('student_available_exams')
  if (error) throw error
  return ((data as unknown as AvailableExam[]) ?? []).sort((a, b) => {
    const rank: Record<string, number> = { resume: 0, can_start: 1, upcoming: 2, no_attempts: 3, closed: 4 }
    return (rank[a.status_for_me] ?? 9) - (rank[b.status_for_me] ?? 9)
  })
}

let cachedIp: string | null | undefined

export async function getPublicIp(): Promise<string | null> {
  if (cachedIp !== undefined) return cachedIp
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 3000)
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
    window.clearTimeout(timer)
    const j = (await res.json()) as { ip?: string }
    cachedIp = typeof j.ip === 'string' ? j.ip.slice(0, 64) : null
  } catch {
    cachedIp = null
  }
  return cachedIp
}

function collectDeviceInfo(): Record<string, unknown> {
  try {
    let deviceId: string | null = null
    try {
      deviceId = localStorage.getItem('cbt-device-id')
      if (!deviceId) {
        deviceId = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
        localStorage.setItem('cbt-device-id', deviceId)
      }
    } catch { deviceId = null }
    return {
      device_id: deviceId,
      platform: navigator.platform ?? null,
      language: navigator.language ?? null,
      screen: `${window.screen.width}x${window.screen.height}`,
      dpr: window.devicePixelRatio ?? 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      userAgent: navigator.userAgent.slice(0, 300),
    }
  } catch {
    return {}
  }
}

export async function startAttempt(
  examId: string,
  pin?: string,
): Promise<{ attempt_id: string; resumed: boolean }> {
  const [ip] = await Promise.all([getPublicIp()])

  const { data, error } = await supabase.rpc('start_attempt', {
    p_exam_id: examId,
    p_pin: pin ?? null,
    p_user_agent: navigator.userAgent.slice(0, 500),
    p_device_info: collectDeviceInfo(),
    p_ip: ip,
  })
  if (error) throw error
  const result = data as { attempt_id: string; resumed?: boolean }
  return { attempt_id: result.attempt_id, resumed: Boolean(result.resumed) }
}

export async function getAttemptPayload(attemptId: string): Promise<AttemptPayload> {
  const { data, error } = await supabase.rpc('get_attempt_payload', { p_attempt_id: attemptId })
  if (error) throw error
  const payload = typeof data === 'string' ? JSON.parse(data) : data

  payload.order = Array.isArray(payload.order)
    ? payload.order.map((id: unknown) => String(id))
    : Object.keys(payload.questions ?? {})

  const normalizedAnswers: Record<string, AnswerValue> = {}
  for (const [k, v] of Object.entries(payload.answers ?? {})) {
    normalizedAnswers[k] = v as AnswerValue
    const q = payload.questions[k]
    if (q?.type === 'matching' && v && typeof v === 'object' && !Array.isArray(v)) {
      normalizedAnswers[k] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([lk, rk]) => [lk, Number(rk)]),
      )
    }
  }
  payload.answers = normalizedAnswers

  payload.remaining_seconds = Math.max(0, Math.round(Number(payload.remaining_seconds) || 0))
  return payload as AttemptPayload
}

export async function saveAnswer(
  attemptId: string,
  questionId: string,
  value: AnswerValue,
): Promise<void> {
  const { error } = await supabase.rpc('save_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_value: value === undefined ? null : value,
  })
  if (error) throw error
}

export async function submitAttempt(attemptId: string, auto = false): Promise<SubmitSummary> {
  const { data, error } = await supabase.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_auto: auto,
  })
  if (error) throw error
  return (data ?? {}) as SubmitSummary
}

export async function recordViolation(
  attemptId: string,
  violationType: string,
  severity: 'warning' | 'serious' | 'critical' = 'warning',
  metadata: Record<string, unknown> = {},
): Promise<ViolationResponse> {
  const { data, error } = await supabase.rpc('record_violation', {
    p_attempt_id: attemptId,
    p_violation_type: violationType,
    p_severity: severity,
    p_metadata: metadata,
  })
  if (error) throw error
  return (data ?? {}) as ViolationResponse
}

export async function getMyAttempts(): Promise<
  {
    id: string
    status: string
    started_at: string
    submitted_at: string | null
    violation_count: number
    exam_id: string
    exams: { title: string; duration_minutes: number; status: string; starts_at: string; ends_at: string; show_result_to_student: boolean; show_answers_after: boolean } | null
    results: {
      final_score: number | null
      objective_score: number
      essay_score: number | null
      passed: boolean | null
      correct_count: number
      wrong_count: number
      unanswered_count: number
      total_questions: number
      duration_seconds: number | null
    }[] | null
  }[]
> {
  const { data, error } = await supabase
    .from('exam_attempts')
    .select(`id, status, started_at, submitted_at, violation_count, exam_id,
      exams(title, duration_minutes, status, starts_at, ends_at, show_result_to_student, show_answers_after),
      results:exam_results(final_score, objective_score, essay_score, passed, correct_count, wrong_count, unanswered_count, total_questions, duration_seconds)`)
    .order('started_at', { ascending: false })
  if (error) throw error
  return (
    (data as unknown as {
      id: string
      status: string
      started_at: string
      submitted_at: string | null
      violation_count: number
      exam_id: string
      exams: { title: string; duration_minutes: number; status: string; starts_at: string; ends_at: string; show_result_to_student: boolean; show_answers_after: boolean } | null
      results: {
        final_score: number | null
        objective_score: number
        essay_score: number | null
        passed: boolean | null
        correct_count: number
        wrong_count: number
        unanswered_count: number
        total_questions: number
        duration_seconds: number | null
      }[] | null
    }[]) ?? []
  )
}
