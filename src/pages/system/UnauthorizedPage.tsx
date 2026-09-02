import { Navigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_HOME } from '@/lib/constants'
import { PageLoader } from '@/components/ui/Feedback'

export default function UnauthorizedPage() {
  const { profile, loading } = useAuth()

  if (loading) return <PageLoader />
  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-slate-800">Akses ditolak</h1>
        <p className="mt-1 max-w-sm text-sm text-slate-400">
          Anda tidak memiliki izin untuk mengakses halaman ini.
        </p>
      </div>
    </div>
  )
}
