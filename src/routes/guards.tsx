import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_HOME } from '@/lib/constants'
import { PageLoader } from '@/components/ui/Feedback'
import { isEnvConfigured } from '@/services/client'

export function RequireAuth({ children }: { children?: ReactNode }) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (!isEnvConfigured()) {
    return <Navigate to="/env-required" replace />
  }
  if (loading) return <PageLoader label="Memeriksa sesi..." />
  if (!profile) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (location.pathname === '/login' || location.pathname === '/') {
    return <Navigate to={ROLE_HOME[profile.role] ?? '/login'} replace />
  }
  return children ?? <Outlet />
}

export function PageGate({ children }: { children?: ReactNode }) {
  const { profile, loading } = useAuth()
  if (!isEnvConfigured()) return <Navigate to="/env-required" replace />
  if (loading) return <PageLoader label="Memeriksa sesi..." />
  if (!profile) return <Navigate to="/login" replace />
  return children ?? <Outlet />
}

export function RequireRole({ role, children }: { role: string; children?: ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) return <PageLoader />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role !== role) {
    return <Navigate to={ROLE_HOME[profile.role] ?? '/unauthorized'} replace />
  }
  return children ?? <Outlet />
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />
  return <>{children}</>
}
