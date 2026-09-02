import { supabase } from './client'
import type { Violation } from '@/types/models'

export async function listViolations(params: {
  examId?: string
  severity?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: Violation[]; total: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  let builder = supabase
    .from('exam_violations')
    .select(
      `*, exams(title),
       students(profiles(full_name), nis)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
  if (params.examId) builder = builder.eq('exam_id', params.examId)
  if (params.severity) builder = builder.eq('severity', params.severity)

  const { data, error, count } = await builder.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error

  const rows = ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => {
    const students = r.students as
      | { profiles: { full_name: string } | { full_name: string }[] | null; nis: string | null }
      | null
    const profiles = students?.profiles
    return {
      ...r,
      exams: Array.isArray(r.exams) ? r.exams[0] : r.exams,
      students: {
        nis: students?.nis ?? null,
        profiles: Array.isArray(profiles) ? profiles[0] : profiles,
      },
    }
  }) as unknown as Violation[]
  return { rows, total: count ?? 0 }
}
