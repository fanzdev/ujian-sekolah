import { supabase } from './client'

export interface SetupPayload {
  username: string
  password: string
  fullName: string
  appName?: string
  schoolName?: string
  logoUrl?: string
  city?: string
  address?: string
  headmaster?: string
  academicYear?: string
}

/** true = wizard setup harus ditampilkan (belum ada admin). */
export async function getSetupStatus(): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_setup_status')
  if (error) {
    const msg = error.message ?? ''
    const code = (error as { code?: string }).code ?? ''

    if (code === 'PGRST202' || msg.includes('Could not find the function') || msg.includes('schema cache')) {
      throw new Error(
        'Fungsi setup belum tersedia di database. Jalankan supabase/migrations/00007_setup_bootstrap.sql di Supabase SQL Editor, lalu muat ulang halaman ini.',
      )
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new Error(
        'Tidak dapat terhubung ke Supabase. Periksa VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY pada file .env, lalu muat ulang halaman.',
      )
    }
    throw new Error(msg)
  }
  const result = data as { needs_setup?: boolean } | string | null
  if (typeof result === 'string') return Boolean(JSON.parse(result).needs_setup)
  return Boolean(result?.needs_setup)
}

export async function runSetup(
  payload: SetupPayload,
): Promise<{ ok: boolean; username: string }> {
  const { data, error } = await supabase.rpc('bootstrap_setup', {
    p_username: payload.username,
    p_password: payload.password,
    p_full_name: payload.fullName,
    p_app_name: payload.appName ?? null,
    p_school_name: payload.schoolName ?? null,
    p_logo_url: payload.logoUrl ?? null,
    p_city: payload.city ?? null,
    p_address: payload.address ?? null,
    p_headmaster: payload.headmaster ?? null,
    p_academic_year: payload.academicYear ?? null,
  })
  if (error) throw error
  return (data ?? {}) as { ok: boolean; username: string }
}
