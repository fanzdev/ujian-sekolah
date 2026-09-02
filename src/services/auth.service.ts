import { supabase } from './client'
import type { Profile, UserRole } from '@/types/models'
import { logAudit } from './audit.service'

const AUTH_DOMAIN_SUFFIX = '@cbt.local'

function toAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}${AUTH_DOMAIN_SUFFIX}`
}

export async function signInWithUsername(username: string, password: string): Promise<Profile> {
  const email = toAuthEmail(username)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  const profile = await fetchMyProfile()
  if (!profile) throw new Error('Profil tidak ditemukan. Hubungi administrator.')
  if (!profile.is_active) {
    await supabase.auth.signOut()
    throw new Error('Akun Anda dinonaktifkan. Hubungi administrator.')
  }
  void logAudit('LOGIN', 'profile', profile.id).catch(() => undefined)
  return profile
}

export async function signOut(): Promise<void> {
  void logAudit('LOGOUT').catch(() => undefined)
  await supabase.auth.signOut()
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

export async function updateMyProfile(fields: {
  full_name?: string
  avatar_url?: string | null
}): Promise<Profile> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) throw new Error('Tidak ada sesi aktif.')

  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', uid)
    .select()
    .single()
  if (error) throw error
  return data as Profile
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const email = sessionData.session?.user?.email
  if (!email) throw new Error('Tidak ada sesi aktif.')

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (verifyErr) throw new Error('Password saat ini salah.')

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
  void logAudit('CHANGE_SETTINGS', 'auth_password', null, { action: 'change_password' }).catch(
    () => undefined,
  )
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Super Admin'
    case 'teacher':
      return 'Guru'
    case 'student':
      return 'Siswa'
    default:
      return role
  }
}
