import { supabase } from './client'
import { logAudit, logAudit as audit } from './audit.service'
import type { Exam, ExamParticipant, ExamQuestionLink, ExamTarget } from '@/types/models'

export const examSelect = `*, subjects(name), teachers(id, profiles(full_name))`

function mapExam(row: Record<string, unknown>): Exam {
  return row as unknown as Exam
}

export async function listExams(params: {
  status?: string
  subjectId?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: Exam[]; total: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  let builder = supabase.from('exams').select(examSelect, { count: 'exact' })
  if (params.status) builder = builder.eq('status', params.status)
  if (params.subjectId) builder = builder.eq('subject_id', params.subjectId)
  if (params.search) builder = builder.ilike('title', `%${params.search}%`)

  const { data, error, count } = await builder
    .order('starts_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { rows: ((data as unknown as Record<string, unknown>[]) ?? []).map(mapExam), total: count ?? 0 }
}

export async function getExam(id: string): Promise<Exam | null> {
  const { data, error } = await supabase.from('exams').select(examSelect).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapExam(data as Record<string, unknown>) : null
}

export type ExamInput = Partial<Omit<Exam, 'id' | 'created_at' | 'total_points'>>

export async function createExam(input: ExamInput): Promise<Exam> {
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user?.id

  const { code, ...rest } = input as ExamInput & { code?: never }
  void code

  let defaults: Record<string, unknown> = {}
  try {
    const { data: def } = await supabase.from('system_settings').select('value').eq('key', 'exam_defaults').maybeSingle()
    if (def?.value && typeof def.value === 'object') defaults = def.value as Record<string, unknown>
  } catch { /* ignore */ }

  const sanitizeNum = (v: unknown, fallback: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const merged: Record<string, unknown> = {
    shuffle_questions: (defaults.shuffle_questions as boolean | undefined) ?? true,
    shuffle_options: (defaults.shuffle_options as boolean | undefined) ?? true,
    max_attempts: sanitizeNum(defaults.max_attempts, 1),
    violation_limit: sanitizeNum(defaults.violation_limit, 3),
    auto_submit_on_limit: (defaults.auto_submit_on_limit as boolean | undefined) ?? true,
    fullscreen_required: (defaults.fullscreen_required as boolean | undefined) ?? true,
    camera_monitoring: (defaults.camera_monitoring as boolean | undefined) ?? true,
    show_result_to_student: (defaults.show_result_to_student as boolean | undefined) ?? true,
    show_answers_after: (defaults.show_answers_after as boolean | undefined) ?? true,
    passing_grade: sanitizeNum(defaults.passing_grade, 0),
    allow_outside_schedule: (defaults.allow_outside_schedule as boolean | undefined) ?? false,
    ...rest,
  }
  // Sanitize numeric fields from rest if they are NaN
  for (const k of ['max_attempts', 'violation_limit', 'passing_grade'] as const) {
    const v = merged[k]
    if (v !== null && v !== undefined && !Number.isFinite(Number(v))) {
      merged[k] = k === 'passing_grade' ? 0 : k === 'violation_limit' ? 3 : 1
    } else if (typeof v === 'number') {
      merged[k] = k === 'passing_grade' ? Number(v) : Math.trunc(Number(v))
    }
  }

  const tryInsert = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.from('exams').insert({ ...payload, created_by: uid }).select().single()
    if (error) throw error
    return data
  }

  let data: Record<string, unknown>
  try {
    data = (await tryInsert(merged)) as Record<string, unknown>
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isMissingColumn = msg.toLowerCase().includes('allow_outside_schedule')
    const isDuplicate = msg.toLowerCase().includes('duplicate') || msg.includes('23505') || msg.toLowerCase().includes('unique')
    if (isMissingColumn) {
      const fallback = { ...merged }
      delete (fallback as Record<string, unknown>).allow_outside_schedule
      try {
        data = (await tryInsert(fallback)) as Record<string, unknown>
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2)
        if (msg2.toLowerCase().includes('duplicate') || msg2.includes('23505')) {
          // retry with new random code
          const retryPayload = { ...fallback, exam_code: (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4)).toUpperCase() }
          data = (await tryInsert(retryPayload)) as Record<string, unknown>
        } else {
          throw err2
        }
      }
    } else if (isDuplicate) {
      const retryPayload = { ...merged, exam_code: (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4)).toUpperCase() }
      // if allow_outside still missing, remove it for retry as well
      if (String(msg).toLowerCase().includes('allow_outside_schedule')) delete (retryPayload as Record<string, unknown>).allow_outside_schedule
      data = (await tryInsert(retryPayload)) as Record<string, unknown>
    } else {
      throw err
    }
  }
  void logAudit('CREATE_EXAM', 'exam', (data as unknown as Exam).id, { title: (data as unknown as Exam).title })
  return mapExam(data as Record<string, unknown>)
}

export async function updateExam(id: string, input: ExamInput): Promise<void> {
  const { data: prev } = await supabase.from('exams').select('status').eq('id', id).single()
  const { error } = await supabase.from('exams').update(input).eq('id', id)
  if (error) throw error
  if (prev?.status !== input.status && input.status === 'published') {
    void audit('PUBLISH_EXAM', 'exam', id)
  } else {
    void logAudit('UPDATE_EXAM', 'exam', id)
  }
}

export async function deleteExam(id: string): Promise<void> {
  const { error } = await supabase.from('exams').delete().eq('id', id)
  if (error) throw error
  void logAudit('DELETE_EXAM', 'exam', id)
}

// ---------- Targets ----------
export async function getExamTargets(examId: string): Promise<ExamTarget[]> {
  const { data, error } = await supabase.from('exam_targets').select('*').eq('exam_id', examId)
  if (error) throw error
  return (data as unknown as ExamTarget[]) ?? []
}

export async function setExamTargets(examId: string, targets: Omit<ExamTarget, 'id' | 'exam_id'>[]): Promise<void> {
  await supabase.from('exam_targets').delete().eq('exam_id', examId)
  if (targets.length > 0) {
    const { error } = await supabase
      .from('exam_targets')
      .insert(targets.map((t) => ({ exam_id: examId, kind: t.kind, target_id: t.target_id })))
    if (error) throw error
  }
}

// ---------- Participants ----------
export async function getParticipants(examId: string): Promise<ExamParticipant[]> {
  const { data, error } = await supabase
    .from('exam_participants')
    .select(`*, students(
        nis,
        profiles(full_name),
        classes(name)
      )`)
    .eq('exam_id', examId)
    .order('created_at')
  if (error) throw error
  return (data as unknown as ExamParticipant[]) ?? []
}

export async function addParticipant(examId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('exam_participants')
    .upsert({ exam_id: examId, student_id: studentId, is_removed: false }, { onConflict: 'exam_id,student_id' })
  if (error) throw error
}

export async function removeParticipant(examId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('exam_participants')
    .update({ is_removed: true })
    .eq('exam_id', examId)
    .eq('student_id', studentId)
  if (error) throw error
}

export async function syncParticipants(examId: string): Promise<void> {
  // Re-run server-side sync by touching targets (trigger repopulates).
  const targets = await getExamTargets(examId)
  for (const t of targets) {
    await supabase.from('exam_targets').upsert(t, { onConflict: 'exam_id,kind,target_id' })
  }
}

// ---------- Exam questions ----------
export async function getExamQuestions(examId: string): Promise<ExamQuestionLink[]> {
  const { data, error } = await supabase
    .from('exam_questions')
    .select('*, questions(*, question_options(*), matching_pairs(*))')
    .eq('exam_id', examId)
    .order('position')
  if (error) throw error
  return (data as unknown as ExamQuestionLink[]) ?? []
}

export async function setExamQuestions(
  examId: string,
  items: { question_id: string; position: number; points: number | null }[],
): Promise<void> {
  await supabase.from('exam_questions').delete().eq('exam_id', examId)
  if (items.length > 0) {
    const { error } = await supabase
      .from('exam_questions')
      .insert(items.map((i) => ({ exam_id: examId, question_id: i.question_id, position: i.position, points: i.points })))
    if (error) throw error
  }
}
