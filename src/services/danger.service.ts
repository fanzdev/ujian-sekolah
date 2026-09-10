import { supabase } from './client'

export async function wipeStudents(): Promise<number> {
  const { data } = await supabase.from('students').select('profile_id')
  const ids = (data ?? []).map((r) => (r as unknown as { profile_id: string }).profile_id)
  for (const pid of ids) {
    try { await supabase.rpc('admin_delete_user', { p_user_id: pid }) } catch { void 0 }
    try { await supabase.from('profiles').delete().eq('id', pid) } catch { void 0 }
  }
  const { error } = await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
  return ids.length
}

export async function wipeTeachers(excludeSelfId?: string): Promise<number> {
  const { data } = await supabase.from('teachers').select('profile_id')
  let ids = (data ?? []).map((r) => (r as unknown as { profile_id: string }).profile_id)
  if (excludeSelfId) ids = ids.filter((id) => id !== excludeSelfId)
  for (const pid of ids) {
    try { await supabase.rpc('admin_delete_user', { p_user_id: pid }) } catch { void 0 }
    try { await supabase.from('profiles').delete().eq('id', pid) } catch { void 0 }
  }
  let q = supabase.from('teachers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (excludeSelfId) q = q.neq('profile_id', excludeSelfId)
  const { error } = await q
  if (error) throw error
  return ids.length
}

export async function wipeClasses(): Promise<void> {
  const { error } = await supabase.from('classes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeDepartments(): Promise<void> {
  const { error } = await supabase.from('departments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeSubjects(): Promise<void> {
  const { error } = await supabase.from('subjects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeBanks(): Promise<void> {
  const { error } = await supabase.from('question_banks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeExams(): Promise<void> {
  try { await supabase.from('exam_results').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('essay_grades').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_violations').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_questions').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_participants').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_targets').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  const { error } = await supabase.from('exams').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeResults(): Promise<void> {
  try { await supabase.from('exam_results').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('essay_grades').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_violations').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
}

export async function wipeViolations(): Promise<void> {
  const { error } = await supabase.from('exam_violations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeAudit(): Promise<void> {
  const { error } = await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeAll(excludeSelfId?: string): Promise<void> {
  try { await wipeResults() } catch { void 0 }
  try { await wipeExams() } catch { void 0 }
  try { await wipeBanks() } catch { void 0 }
  try { await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await wipeSubjects() } catch { void 0 }
  try { await wipeClasses() } catch { void 0 }
  try { await wipeDepartments() } catch { void 0 }
  try { await wipeTeachers(excludeSelfId) } catch { void 0 }
  try { await wipeStudents() } catch { void 0 }
  try { await wipeViolations() } catch { void 0 }
  try { await wipeAudit() } catch { void 0 }
  try { await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('media_files').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
}

export async function wipeAllIncludingAdmin(): Promise<void> {
  await wipeAll()
  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
  for (const a of (admins ?? []) as unknown as { id: string }[]) {
    try { await supabase.rpc('admin_delete_user', { p_user_id: a.id }) } catch { void 0 }
    try { await supabase.from('profiles').delete().eq('id', a.id) } catch { void 0 }
  }
}
