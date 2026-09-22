import { Link } from 'react-router-dom'
import { KeyRound, ExternalLink, LogIn, Database, FileCog, Rocket } from 'lucide-react'
import { BrandMark } from '@/components/layout/Topbar'
import { useDocumentTitle } from '@/hooks/useAsync'

const STEPS = [
  { icon: FileCog, title: 'Salin .env', desc: '.env.example menjadi .env' },
  { icon: Database, title: 'Isi Supabase', desc: 'URL + anon key project' },
  { icon: Rocket, title: 'Migrasi & Build', desc: 'Jalankan migrasi lalu build' },
]

export default function SetupRequiredPage() {
  useDocumentTitle('Konfigurasi Diperlukan')
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 p-6 dark:bg-slate-800">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary-200/50 blur-3xl animate-blob dark:bg-primary-500/10" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-amber-200/50 blur-3xl animate-blob dark:bg-amber-500/10" style={{ animationDelay: '-7s' }} />
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.3) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
      </div>
      <div className="relative w-full max-w-lg stagger">
        <div className="card overflow-hidden animate-rise">
          <div className="h-1.5 w-full animate-gradient-pan bg-gradient-to-r from-amber-400 via-primary-500 to-amber-400" style={{ backgroundSize: '200% 100%' }} />
          <div className="p-7 sm:p-8">
            <BrandMark />
            <div className="mt-6 flex items-start gap-4">
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-2xl bg-amber-400/40 blur-lg animate-pulse-soft" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30 animate-float-soft">
                  <KeyRound className="h-7 w-7" />
                </div>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Perlu Tindakan</p>
                <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Konfigurasi Environment Diperlukan</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  Variabel <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">VITE_SUPABASE_URL</code> dan{' '}
                  <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">VITE_SUPABASE_ANON_KEY</code>{' '}
                  belum diatur. Aplikasi membutuhkan koneksi ke Supabase untuk berjalan.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, desc }, i) => (
                <div key={title} className="group rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 transition-all hover:-translate-y-1 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm transition-transform group-hover:scale-110 dark:bg-slate-700 dark:text-primary-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-[11px] font-black text-slate-300 dark:text-slate-600">0{i + 1}</span>
                  </div>
                  <p className="mt-2.5 text-[13px] font-bold text-slate-800 dark:text-slate-100">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{desc}</p>
                </div>
              ))}
            </div>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-300 dark:hover:text-primary-200"
            >
              Buka Supabase Dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Link
              to="/login"
              className="btn-shine mt-5 flex items-center justify-center gap-2 rounded-2xl bg-primary-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-600/25 transition-all hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-xl active:translate-y-0"
            >
              <LogIn className="h-4 w-4" /> Coba Login Lagi
            </Link>
          </div>
        </div>
        <p className="mt-4 text-center font-mono text-[11px] text-slate-400 dark:text-slate-500">Lihat docs/SUPABASE_SETUP.md untuk panduan lengkap</p>
      </div>
    </div>
  )
}
