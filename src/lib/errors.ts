export function friendlyError(err: unknown): string {
  if (!err) return 'Terjadi kesalahan tak terduga.'
  if (typeof err === 'string') return err

  const anyErr = err as { message?: string; code?: string; details?: string; hint?: string }
  const msg = anyErr.message ?? ''

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Koneksi internet terputus. Periksa jaringan Anda dan coba lagi.'
  }
  if (anyErr.code === '23505' || msg.includes('duplicate key')) {
    return 'Data sudah ada (duplikat). Periksa kembali.'
  }
  if (anyErr.code === '23503' || msg.includes('foreign key')) {
    return 'Data tidak dapat dihapus karena masih dipakai oleh data lain.'
  }
  if (msg.includes('JWT') || msg.includes('token') || anyErr.code === '401') {
    return 'Sesi Anda berakhir. Silakan login kembali.'
  }
  if (anyErr.code === '42501' || msg.includes('row-level security')) {
    return 'Anda tidak memiliki izin untuk aksi ini.'
  }
  if (msg.includes('"identities"')) {
    return 'Skema auth database belum cocok dengan fungsi setup terbaru. Jalankan ulang file supabase/migrations/00007_setup_bootstrap.sql (versi terbaru) di SQL Editor, lalu coba lagi.'
  }
  if (msg.includes('Setup telah selesai')) {
    return 'Setup sudah pernah diselesaikan. Silakan login dengan akun yang sudah ada.'
  }
  if (msg.includes('User already registered')) {
    return 'Akun dengan email/username tersebut sudah terdaftar.'
  }
  if (msg.includes('Invalid login credentials')) {
    return 'Username atau password salah.'
  }
  if (msg.includes('Email not confirmed')) {
    return 'Akun belum terverifikasi. Hubungi admin.'
  }

  const clean = msg.replace(/\b(FATAL|ERROR)\b[:\s]*/gi, '').trim()
  if (clean && !clean.includes('stack') && clean.length < 300) return clean
  return 'Terjadi kesalahan. Coba lagi atau hubungi administrator.'
}

export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}
