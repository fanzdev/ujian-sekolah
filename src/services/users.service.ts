import { invokeEdge, rpc } from './client'
import { logAudit } from './audit.service'
import { supabase } from './client'
import type { Profile } from '@/types/models'

export interface CreateUserData {
  username: string
  password: string
  fullName: string
  role: 'admin' | 'teacher' | 'student'
  student?: {
    nis?: string
    nisn?: string
    gender?: 'L' | 'P'
    birth_place?: string
    birth_date?: string
    address?: string
    phone?: string
    email?: string
    class_id?: string | null
  }
  teacher?: {
    nip?: string
    phone?: string
    email?: string
    address?: string
    subject_ids?: string[]
  }
}

export interface ManageUserRow {
  id: string
  username: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

export async function pingManageUser(): Promise<boolean> {
  try {
    await invokeEdge('manage-user', { action: 'ping' })
    return true
  } catch {
    try {
      const { error } = await supabase.rpc('admin_create_user', {
        p_username: '',
        p_password: '',
        p_full_name: '',
        p_role: 'student',
      })
      if (error) {
        const msg = error.message ?? ''
        if (msg.includes('does not exist') || msg.includes('Could not find the function') || msg.includes('not found')) {
          return true
        }
        return true
      }
      return true
    } catch {
      return true
    }
  }
}

function isEdgeMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('tidak tersedia') || msg.includes('Edge Function') || msg.includes('Failed to fetch') || msg.includes('FunctionsFetchError') || msg.includes('404')
}

async function createViaRpc(data: CreateUserData): Promise<{ user_id: string }> {
  const { data: res, error } = await supabase.rpc('admin_create_user', {
    p_username: data.username,
    p_password: data.password,
    p_full_name: data.fullName,
    p_role: data.role,
    p_student: data.student ? (data.student as unknown as Record<string, unknown>) : null,
    p_teacher: data.teacher ? (data.teacher as unknown as Record<string, unknown>) : null,
  })
  if (error) throw error
  const parsed = res as { user_id?: string; ok?: boolean } | null
  const uid = parsed?.user_id ?? (res as unknown as string)
  if (!uid || typeof uid !== 'string') throw new Error('Gagal membuat akun via RPC.')
  void logAudit('CREATE_USER', 'profile', uid, { role: data.role, username: data.username, via: 'rpc' })
  return { user_id: uid }
}

async function createViaSignUp(data: CreateUserData): Promise<{ user_id: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const adminSession = sessionData.session
  if (!adminSession) throw new Error('Sesi admin tidak ditemukan. Silakan login ulang.')
  const email = `${data.username.trim().toLowerCase()}@cbt.local`
  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password: data.password,
    options: { data: { username: data.username.trim().toLowerCase(), full_name: data.fullName.trim(), role: data.role } },
  })
  if (error) throw error
  const newUserId = signUpData.user?.id
  if (!newUserId) throw new Error('Gagal membuat akun: ID tidak tersedia.')
  try {
    await supabase.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token })
  } catch {
    await supabase.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token }).catch(() => undefined)
  }
  for (let i = 0; i < 8; i++) {
    const { data: prof } = await supabase.from('profiles').select('id').eq('id', newUserId).maybeSingle()
    if (prof) break
    await new Promise((r) => setTimeout(r, 250))
  }
  await supabase.from('profiles').update({ username: data.username.trim().toLowerCase(), full_name: data.fullName.trim(), role: data.role }).eq('id', newUserId)
  if (data.role === 'student' && data.student) {
    const s = data.student
    const { error: stuErr } = await supabase.from('students').insert({
      profile_id: newUserId,
      nis: s.nis || null,
      nisn: s.nisn || null,
      gender: s.gender || null,
      birth_place: s.birth_place || null,
      birth_date: s.birth_date || null,
      address: s.address || null,
      phone: s.phone || null,
      email: s.email || null,
      class_id: s.class_id || null,
    })
    if (stuErr) throw stuErr
  }
  if (data.role === 'teacher' && data.teacher) {
    const t = data.teacher
    const { error: teaErr } = await supabase.from('teachers').insert({
      profile_id: newUserId,
      nip: t.nip || null,
      phone: t.phone || null,
      email: t.email || null,
      address: t.address || null,
    })
    if (teaErr) throw teaErr
    if (t.subject_ids?.length) {
      await supabase.from('teacher_subjects').insert(t.subject_ids.map((sid) => ({ teacher_id: newUserId, subject_id: sid })))
    }
  }
  void logAudit('CREATE_USER', 'profile', newUserId, { role: data.role, username: data.username, via: 'signup_fallback' })
  return { user_id: newUserId }
}

export async function createFullUser(data: CreateUserData): Promise<{ user_id: string }> {
  try {
    const result = await invokeEdge<{ user_id: string; email: string }>('manage-user', {
      action: 'create_user',
      username: data.username,
      password: data.password,
      full_name: data.fullName,
      role: data.role,
      student: data.student,
      teacher: data.teacher,
    })
    void logAudit('CREATE_USER', 'profile', result.user_id, { role: data.role, username: data.username })
    return result
  } catch (err) {
    if (!isEdgeMissingError(err)) throw err
    try {
      return await createViaRpc(data)
    } catch (rpcErr) {
      const rpcMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
      const rpcMissing = rpcMsg.includes('does not exist') || rpcMsg.includes('Could not find the function') || rpcMsg.includes('not found') || rpcMsg.includes('PGRST202')
      if (!rpcMissing) throw rpcErr
      return await createViaSignUp(data)
    }
  }
}

export async function updateUser(
  userId: string,
  fields: { full_name?: string; is_active?: boolean },
): Promise<void> {
  try {
    await invokeEdge('manage-user', { action: 'update_user', user_id: userId, ...fields })
    void logAudit('UPDATE_USER', 'profile', userId, fields)
    return
  } catch (err) {
    if (!isEdgeMissingError(err)) throw err
  }
  const upd: Record<string, unknown> = {}
  if (fields.full_name !== undefined) upd.full_name = fields.full_name
  if (typeof fields.is_active === 'boolean') upd.is_active = fields.is_active
  if (Object.keys(upd).length > 0) {
    const { error } = await supabase.from('profiles').update(upd).eq('id', userId)
    if (error) throw error
  }
  void logAudit('UPDATE_USER', 'profile', userId, { ...fields, via: 'fallback' })
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  try {
    await invokeEdge('manage-user', { action: 'reset_password', user_id: userId, new_password: newPassword })
    void logAudit('RESET_PASSWORD', 'profile', userId)
    return
  } catch (err) {
    if (!isEdgeMissingError(err)) throw err
    throw new Error('Reset password memerlukan Edge Function manage-user. Deploy fungsi tersebut atau jalankan migrasi 00011 lalu gunakan SQL: select auth.admin_update_user. Alternatif: admin dapat meminta siswa melakukan reset via halaman profil.')
  }
}

export async function deleteUser(userId: string): Promise<void> {
  try {
    await invokeEdge('manage-user', { action: 'delete_user', user_id: userId })
    void logAudit('DELETE_USER', 'profile', userId)
    return
  } catch (err) {
    if (!isEdgeMissingError(err)) throw err
  }
  try {
    await rpc('admin_delete_user', { p_user_id: userId })
    void logAudit('DELETE_USER', 'profile', userId, { via: 'rpc_fallback' })
    return
  } catch (rpcErr) {
    const rpcMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
    const rpcMissing = rpcMsg.includes('does not exist') || rpcMsg.includes('Could not find the function') || rpcMsg.includes('not found') || rpcMsg.includes('PGRST202')
    if (!rpcMissing) throw rpcErr
  }
  const { error } = await supabase.from('profiles').delete().eq('id', userId)
  if (error) throw error
  void logAudit('DELETE_USER', 'profile', userId, { via: 'fallback' })
}

export async function listProfiles(params: {
  role?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: Profile[]; total: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  let builder = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('full_name')

  if (params.role) builder = builder.eq('role', params.role)
  if (params.search) builder = builder.or(`username.ilike.%${params.search}%,full_name.ilike.%${params.search}%`)

  const { data, error, count } = await builder.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { rows: (data as Profile[]) ?? [], total: count ?? 0 }
}
