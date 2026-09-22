import { Link } from 'react-router-dom'
import { Compass, House, ArrowLeft } from 'lucide-react'
import { useDocumentTitle } from '@/hooks/useAsync'

export default function NotFoundPage() {
  useDocumentTitle('Halaman Tidak Ditemukan')
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden p-6 text-center">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary-200/40 blur-3xl animate-blob dark:bg-primary-500/10" />
        <div className="absolute bottom-0 left-1/4 h-52 w-52 rounded-full bg-sky-200/40 blur-3xl animate-blob dark:bg-sky-500/10" style={{ animationDelay: '-6s' }} />
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.3) 1px, transparent 0)', backgroundSize: '22px 22px' }} />
      </div>
      <div className="relative stagger flex flex-col items-center">
        <div className="relative">
          <span className="absolute -left-3 top-2 h-2.5 w-2.5 rounded-full bg-amber-400 animate-twinkle" />
          <span className="absolute -right-2 bottom-3 h-2 w-2 rounded-full bg-sky-400 animate-twinkle" style={{ animationDelay: '0.8s' }} />
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-xl shadow-primary-500/30 animate-float-soft">
            <Compass className="h-9 w-9" />
          </div>
        </div>
        <p className="text-gradient-animated mt-6 bg-gradient-to-r from-primary-600 via-sky-500 to-primary-600 bg-clip-text text-7xl font-black tracking-tight text-transparent sm:text-8xl">
          404
        </p>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Halaman tidak ditemukan</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Sepertinya Anda tersesat. Halaman yang dicari tidak ada atau sudah dipindahkan ke lokasi baru.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            to="/"
            className="btn-shine inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/30 transition-all hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-xl active:translate-y-0"
          >
            <House className="h-4 w-4" /> Kembali ke Beranda
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 active:translate-y-0 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali
          </button>
        </div>
      </div>
    </div>
  )
}
