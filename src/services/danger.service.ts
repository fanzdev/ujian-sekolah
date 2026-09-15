import { supabase } from './client'

async function tryGroupWipe(group: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('admin_wipe_group', { p_group: group })
    if (error) return false
    return true
  } catch {
    return false
  }
}

export async function wipeSchedules(): Promise<void> {
  if (await tryGroupWipe('schedules')) return
  const { error } = await supabase.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeStudents(): Promise<number> {
  if (await tryGroupWipe('students')) return 0
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
  void excludeSelfId
  if (await tryGroupWipe('teachers')) return 0
  const { data } = await supabase.from('teachers').select('profile_id')
  let ids = (data ?? []).map((r) => (r as unknown as { profile_id: string }).profile_id)
  if (excludeSelfId) ids = ids.filter((id) => id !== excludeSelfId)
  for (const pid of ids) {
    try { await supabase.rpc('admin_delete_user', { p_user_id: pid }) } catch { void 0 }
    try { await supabase.from('profiles').delete().eq('id', pid) } catch { void 0 }
  }
  try { await supabase.from('schedules').delete().not('teacher_id', 'is', null) } catch { void 0 }
  let q = supabase.from('teachers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (excludeSelfId) q = q.neq('profile_id', excludeSelfId)
  const { error } = await q
  if (error) throw error
  return ids.length
}

export async function wipeClasses(): Promise<void> {
  if (await tryGroupWipe('classes')) return
  try { await supabase.from('schedules').delete().not('class_id', 'is', null) } catch { void 0 }
  const { error } = await supabase.from('classes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
  try {
    const { data } = await supabase.from('schedules').select('id').limit(1)
    if ((data ?? []).length > 0) {
      await supabase.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }
  } catch { void 0 }
}

export async function wipeDepartments(): Promise<void> {
  if (await tryGroupWipe('departments')) return
  try { await supabase.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('classes').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  const { error } = await supabase.from('departments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeSubjects(): Promise<void> {
  if (await tryGroupWipe('subjects')) return
  try { await supabase.from('teacher_subjects').delete().neq('teacher_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  const { error } = await supabase.from('subjects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeBanks(): Promise<void> {
  if (await tryGroupWipe('banks')) return
  try { await supabase.from('exam_results').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('essay_grades').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_violations').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_questions').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_participants').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_targets').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exams').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('matching_pairs').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('question_options').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  const { error } = await supabase.from('question_banks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeExams(): Promise<void> {
  if (await tryGroupWipe('exams')) return
  try { await supabase.from('exam_results').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('essay_grades').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_violations').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_questions').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_participants').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_targets').delete().neq('exam_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  const { error } = await supabase.from('exams').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeResults(): Promise<void> {
  if (await tryGroupWipe('results')) return
  try { await supabase.from('exam_results').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('essay_grades').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_violations').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('exam_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
}

export async function wipeViolations(): Promise<void> {
  if (await tryGroupWipe('violations')) return
  try { await supabase.from('security_events').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  const { error } = await supabase.from('exam_violations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function wipeAudit(): Promise<void> {
  if (await tryGroupWipe('audit')) return
  const { error } = await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

export async function verifyWipe(table: string): Promise<number> {
  try {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
    return count ?? -1
  } catch {
    return -1
  }
}

export async function wipeAll(excludeSelfId?: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('admin_wipe_all_keep_me')
    if (!error) {
      if (excludeSelfId) return
      return
    }
  } catch { void 0 }
  try { await wipeResults() } catch { void 0 }
  try { await wipeExams() } catch { void 0 }
  try { await wipeBanks() } catch { void 0 }
  try { await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('matching_pairs').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('question_options').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('teacher_subjects').delete().neq('teacher_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await wipeSubjects() } catch { void 0 }
  try { await wipeSchedules() } catch { void 0 }
  try { await supabase.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await wipeClasses() } catch { void 0 }
  try { await wipeDepartments() } catch { void 0 }
  try { await wipeTeachers(excludeSelfId) } catch { void 0 }
  try { await wipeStudents() } catch { void 0 }
  try { await wipeViolations() } catch { void 0 }
  try { await wipeAudit() } catch { void 0 }
  try { await supabase.from('security_events').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('media_files').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('answers').delete().neq('id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
  try { await supabase.from('essay_grades').delete().neq('attempt_id', '00000000-0000-0000-0000-000000000000') } catch { void 0 }
}

async function resetSetupFlag(): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key: 'setup_completed', value: { done: false }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

export async function wipeAllIncludingAdmin(): Promise<void> {
  const rpc = await supabase.rpc('wipe_everything_reset_setup')
  if (!rpc.error) return

  const rpcUnsupported = rpc.error.message?.includes('wipe_everything_reset_setup')
  if (!rpcUnsupported) throw rpc.error

  await wipeAll()

  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
  for (const a of (admins ?? []) as unknown as { id: string }[]) {
    try { await supabase.rpc('admin_delete_user', { p_user_id: a.id }) } catch { void 0 }
    try { await supabase.from('profiles').delete().eq('id', a.id) } catch { void 0 }
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    try { await supabase.from('profiles').delete().eq('id', user.id) } catch { void 0 }
  }

  await resetSetupFlag()
}
