import { Link, Navigate } from 'react-router-dom'
import { ShieldAlert, LogIn, House } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_HOME } from '@/lib/constants'
import { PageLoader } from '@/components/ui/Feedback'
import { useDocumentTitle } from '@/hooks/useAsync'

export default function UnauthorizedPage() {
  const { profile, loading } = useAuth()
  useDocumentTitle('Akses Ditolak')

  if (loading) return <PageLoader label="Memeriksa akses..." />
  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-rose-200/50 blur-3xl animate-blob dark:bg-rose-500/10" />
        <div className="absolute bottom-10 left-1/3 h-48 w-48 rounded-full bg-amber-200/50 blur-3xl animate-blob dark:bg-amber-500/10" style={{ animationDelay: '-5s' }} />
      </div>
      <div className="relative stagger flex flex-col items-center">
        <div className="relative">
          <span className="absolute inset-0 rounded-3xl bg-rose-500/30 blur-xl animate-pulse-soft" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-xl shadow-rose-500/30 animate-float-soft">
            <ShieldAlert className="h-9 w-9" />
          </div>
          <span className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border-4 border-white bg-amber-400 text-xs font-black text-white animate-pop dark:border-slate-900">!</span>
        </div>
        <p className="mt-6 font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-rose-500">403 · Akses Ditolak</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">Anda tidak punya izin ke sini</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Halaman ini khusus peran tertentu. Silakan masuk dengan akun yang sesuai atau kembali ke beranda.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            to="/login"
            className="btn-shine inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition-all hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-xl active:translate-y-0"
          >
            <LogIn className="h-4 w-4" /> Masuk Ulang
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 active:translate-y-0 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <House className="h-4 w-4" /> Beranda
          </Link>
        </div>
      </div>
    </div>
  )
}
