import { supabase } from './client'
import { invokeEdge } from './client'
import { logAudit } from './audit.service'
import type { ExamResult, UserRole } from '@/types/models'

export interface EssayQueueItem {
  answer_id: string
  attempt_id: string
  question_id: string
  status: string | null
  ai_score: number | null
  ai_feedback: string | null
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
  let builder = supabase
    .from('answers')
    .select(
      `id, attempt_id, value,
       questions(id, text, points, type),
       attempts!inner(
         id, status,
         students(profiles(full_name), nis)
       ),
       essay_grades(status, ai_score, ai_feedback, final_score, final_feedback, graded_by)`,
    )
    .eq('questions.type', 'essay')
    .in('attempts.status', ['submitted', 'auto_submitted', 'graded'])
    .limit(300)

  if (params.examId) builder = builder.eq('attempts.exam_id', params.examId)

  const { data, error } = await builder
  if (error) throw error

  const rows = ((data as unknown as EssayAnswerRow[]) ?? []).map((r) => {
    const grade = Array.isArray(r.essay_grades) ? r.essay_grades[0] : r.essay_grades
    const attempt = Array.isArray(r.attempts) ? r.attempts[0] : r.attempts
    const student = attempt?.students
      ? Array.isArray(attempt.students)
        ? attempt.students[0]
        : attempt.students
      : null
    const profile = student?.profiles
      ? Array.isArray(student.profiles)
        ? student.profiles[0]
        : student.profiles
      : null
    const question = Array.isArray(r.questions) ? r.questions[0] : r.questions
    return {
      answer_id: r.id,
      attempt_id: r.attempt_id,
      question_id: r.question_id,
      status: grade?.status ?? 'pending',
      ai_score: grade?.ai_score ?? null,
      ai_feedback: grade?.ai_feedback ?? null,
      final_score: grade?.final_score ?? null,
      final_feedback: grade?.final_feedback ?? null,
      graded_by: grade?.graded_by ?? null,
      student_name: profile?.full_name ?? '-',
      student_nis: student?.nis ?? null,
      question_text: question?.text ?? '',
      max_points: Number(question?.points ?? 10),
    }
  })

  if (params.search) {
    const s = params.search.toLowerCase()
    return rows.filter((r) => r.student_name.toLowerCase().includes(s) || (r.student_nis ?? '').includes(s))
  }
  return rows.sort((a, b) => a.status.localeCompare(b.status))
}

interface EssayAnswerRow {
  id: string
  attempt_id: string
  question_id: string
  value: unknown
  questions: { id: string; text: string; points: number }[] | { id: string; text: string; points: number }
  attempts: {
    id: string
    status: string
    students: { profiles: { full_name: string }; nis: string | null }[] | { profiles: { full_name: string }; nis: string | null }
  }[] | {
    id: string
    status: string
    students: { profiles: { full_name: string }; nis: string | null }[] | { profiles: { full_name: string }; nis: string | null }
  }
  essay_grades:
    | { status: string; ai_score: number | null; ai_feedback: string | null; final_score: number | null; final_feedback: string | null; graded_by: string | null }[]
    | { status: string; ai_score: number | null; ai_feedback: string | null; final_score: number | null; final_feedback: string | null; graded_by: string | null }
    | null
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

export async function requestAiGrade(attemptId: string, questionId: string): Promise<{
  score: number
  feedback: string
  confidence: number
}> {
  const result = await invokeEdge<{ suggestion: { score: number; feedback: string; confidence: number } }>(
    'grade-essay',
    { attempt_id: attemptId, question_id: questionId },
  )
  void logAudit('GRADE_ESSAY', 'ai', `${attemptId}:${questionId}`)
  return result.suggestion
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
