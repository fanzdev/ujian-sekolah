import { supabase } from './client'
import { logAudit } from './audit.service'
import type { ExamResult, UserRole } from '@/types/models'

export interface EssayQueueItem {
  answer_id: string
  attempt_id: string
  question_id: string
  status: string | null
  final_score: number | null
  final_feedback: string | null
  graded_by: string | null
  student_name: string
  student_nis: string | null
  question_text: string
  max_points: number
}

export async function listEssayQueue(params: {
  examId?: string
  search?: string
}): Promise<EssayQueueItem[]> {
  try {
    const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
    const { data, error } = await rpc('list_essay_queue', {
      p_exam_id: params.examId ?? null,
      p_search: params.search ?? null,
    })
    if (error) throw error
    if (data && Array.isArray(data) && data.length > 0) return data as EssayQueueItem[]
  } catch {
    // RPC not available — fall back to direct query
  }

  const qBuilder = supabase
    .from('exam_attempts')
    .select('id, student_id, status, exam_id')
    .in('status', ['submitted', 'auto_submitted', 'graded'])
    .limit(300)
  if (params.examId) qBuilder.eq('exam_id', params.examId)
  const { data: attempts, error: attErr } = await qBuilder
  if (attErr) throw attErr
  const attemptIds = (attempts ?? []).map((a) => a.id as string)
  if (attemptIds.length === 0) return []

  const { data: essayAns, error: ansErr } = await supabase
    .from('answers')
    .select('id, attempt_id, question_id, questions(id, text, points, type)')
    .in('attempt_id', attemptIds)
    .eq('questions.type', 'essay')
  if (ansErr) throw ansErr
  const essayAttempts = new Set(attemptIds.filter((id) =>
    (essayAns ?? []).some((a) => (a as Record<string, unknown>).attempt_id === id),
  ))

  const { data: grades, error: gradeErr } = await supabase
    .from('essay_grades')
    .select('attempt_id, question_id, status, final_score, final_feedback, graded_by')
    .in('attempt_id', attemptIds)
  if (gradeErr) throw gradeErr
  const gradeMap = new Map<string, (typeof grades)[number]>()
  for (const g of grades ?? []) {
    const key = `${g.attempt_id}:${g.question_id}`
    const existing = gradeMap.get(key)
    if (!existing || !existing.status || existing.status === 'pending') gradeMap.set(key, g)
  }

  const { data: students, error: stuErr } = await supabase
    .from('students')
    .select('id, profile_id, nis, profiles(full_name)')
    .in('id', (attempts ?? []).map((a) => (a as Record<string, unknown>).student_id as string))
  if (stuErr) throw stuErr
  const studentMap = new Map<string, (typeof students)[number]>()
  for (const s of students ?? []) studentMap.set(s.id, s)

  const rows: EssayQueueItem[] = []
  for (const a of attempts ?? []) {
    if (!essayAttempts.has(a.id as string)) continue
    const student = studentMap.get((a as Record<string, unknown>).student_id as string)
    const profile = student?.profiles as { full_name?: string } | null
    for (const ans of (essayAns ?? []).filter((x) => (x as Record<string, unknown>).attempt_id === a.id)) {
      const qd = (ans as Record<string, unknown>).questions as { text?: string; points?: number } | null
      const gid = ans.question_id as string
      const g = gradeMap.get(`${a.id}:${gid}`)
      rows.push({
        answer_id: ans.id as string,
        attempt_id: a.id as string,
        question_id: gid,
        status: g?.status ?? 'pending',
        final_score: g?.final_score ?? null,
        final_feedback: g?.final_feedback ?? null,
        graded_by: g?.graded_by ?? null,
        student_name: profile?.full_name ?? '',
        student_nis: student?.nis ?? null,
        question_text: qd?.text ?? '',
        max_points: Number(qd?.points ?? 0),
      })
    }
  }

  if (params.search) {
    const s = params.search.toLowerCase()
    return rows.filter((r) =>
      r.student_name.toLowerCase().includes(s) || (r.student_nis ?? '').toLowerCase().includes(s),
    )
  }
  return rows.sort((a, b) => (a.status ?? 'pending').localeCompare(b.status ?? 'pending'))
}

export async function getEssayDetail(
  attemptId: string,
  questionId: string,
): Promise<{ answerText: string; questionText: string; maxPoints: number } | null> {
  const { data, error } = await supabase.rpc('get_attempt_payload', { p_attempt_id: attemptId })
  if (error) throw error
  const payload = typeof data === 'string' ? JSON.parse(data) : data
  const q = payload?.questions?.[questionId]
  if (!q) return null
  const rawAnswer = payload.answers?.[questionId]
  return {
    questionText: q.text as string,
    maxPoints: Number(q.points ?? 10),
    answerText: typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer ?? ''),
  }
}

export async function gradeEssayFinal(input: {
  attemptId: string
  questionId: string
  score: number
  feedback?: string | null
  role: UserRole
}): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id

  const upsert: Record<string, unknown> = {
    attempt_id: input.attemptId,
    question_id: input.questionId,
    final_score: input.score,
    final_feedback: input.feedback ?? null,
    graded_by: uid,
    graded_at: new Date().toISOString(),
    status: 'graded',
  }

  const { error } = await supabase.from('essay_grades').upsert(upsert, { onConflict: 'attempt_id,question_id' })
  if (error) throw error

  try {
    await supabase.rpc('recalc_result', { p_attempt_id: input.attemptId })
  } catch {
    try {
      await supabase.rpc('ensure_result_recalc', { p_attempt_id: input.attemptId })
    } catch {
      // fallback to trigger - will recalc automatically
    }
  }

  void logAudit('GRADE_ESSAY', 'essay_grade', `${input.attemptId}:${input.questionId}`, {
    score: input.score,
  })

  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('student_id, students(profile_id)')
    .eq('id', input.attemptId)
    .maybeSingle()
  const rawStudents = (attempt as unknown as { students?: unknown })?.students
  const studentObj = Array.isArray(rawStudents) ? rawStudents[0] : rawStudents
  const profileId = (studentObj as { profile_id?: string } | null | undefined)?.profile_id
  if (profileId) {
    await supabase.from('notifications').insert({
      recipient_id: profileId,
      title: 'Nilai essay diperbarui',
      body: 'Jawaban essay Anda telah dinilai oleh guru.',
      type: 'result',
    })
  }
}

// ---------- Results ----------
export async function listResults(params: {
  examId?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: ExamResult[]; total: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25

  let builder = supabase
    .from('exam_results')
    .select(
      `*, exams(title, passing_grade),
       attempts:exam_attempts!inner(status, students!inner(profiles!inner(full_name), nis))`,
      { count: 'exact' },
    )
    .order('final_score', { ascending: false })

  if (params.examId) builder = builder.eq('exam_id', params.examId)

  if (params.search) {
    const term = params.search.trim().replace(/,/g, '').replace(/%/g, '')
    if (term) {
      const { data: profs } = await supabase.from('profiles').select('id').ilike('full_name', `%${term}%`).limit(80)
      const pIds = (profs ?? []).map((p: { id: string }) => p.id)
      let sIds: string[] = []
      if (pIds.length) {
        const { data: sRows } = await supabase.from('students').select('id').in('profile_id', pIds).limit(80)
        sIds = (sRows ?? []).map((r: { id: string }) => r.id)
      }
      const { data: nisRows } = await supabase.from('students').select('id').or(`nis.ilike.%${term}%,nisn.ilike.%${term}%`).limit(80)
      const nIds = (nisRows ?? []).map((r: { id: string }) => r.id)
      const allIds = Array.from(new Set([...sIds, ...nIds]))
      if (allIds.length === 0) return { rows: [], total: 0 }
      builder = builder.in('student_id', allIds)
    }
  }

  const { data, error, count } = await builder.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error

  const rows = (data as unknown as ExamResult[]) ?? []
  return { rows, total: count ?? rows.length }
}
