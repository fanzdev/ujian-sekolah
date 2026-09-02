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

  const { data, error } = await supabase
    .from('exams')
    .insert({ ...rest, created_by: uid })
    .select()
    .single()
  if (error) throw error
  void logAudit('CREATE_EXAM', 'exam', (data as Exam).id, { title: (data as Exam).title })
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
