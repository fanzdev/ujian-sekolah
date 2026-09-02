import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
        <Compass className="h-8 w-8" />
      </div>
      <div>
        <p className="text-5xl font-extrabold tracking-tight text-slate-900">404</p>
        <h1 className="mt-2 text-lg font-bold text-slate-800">Halaman tidak ditemukan</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
          Halaman yang Anda cari tidak ada atau sudah dipindahkan.
        </p>
      </div>
      <Link
        to="/"
        className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
      >
        Kembali ke Beranda
      </Link>
    </div>
  )
}
