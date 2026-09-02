import { Link } from 'react-router-dom'
import { KeyRound, ExternalLink } from 'lucide-react'
import { BrandMark } from '@/components/layout/Topbar'
import { useDocumentTitle } from '@/hooks/useAsync'

export default function SetupRequiredPage() {
  useDocumentTitle('Konfigurasi Diperlukan')
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="card w-full max-w-lg p-8 animate-fade-in">
        <BrandMark />
        <div className="mt-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Konfigurasi Environment Diperlukan</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Variabel <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold">VITE_SUPABASE_URL</code> dan{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold">VITE_SUPABASE_ANON_KEY</code>{' '}
              belum diatur. Aplikasi membutuhkan koneksi ke Supabase untuk berjalan.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Salin <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env.example</code> menjadi <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env</code></li>
              <li>Isi URL dan anon key dari project Supabase Anda</li>
              <li>Jalankan migrasi database (lihat <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">docs/SUPABASE_SETUP.md</code>)</li>
              <li>Build ulang aplikasi (<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run build</code>)</li>
            </ol>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
            >
              Buka Supabase Dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <Link
          to="/login"
          className="mt-6 block rounded-lg bg-primary-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Coba Login Lagi
        </Link>
      </div>
    </div>
  )
}
