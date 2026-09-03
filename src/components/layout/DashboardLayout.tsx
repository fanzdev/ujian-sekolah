import { useEffect, useState, type ReactNode } from 'react'
import { Outlet, useNavigate, Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { getNav } from './nav'
import { SidebarNav } from './SidebarNav'
import { Topbar, BrandMark } from './Topbar'
import { BottomNav } from './BottomNav'
import { FullscreenPrompt } from '@/components/ui/FullscreenPrompt'
import { Avatar } from '@/components/ui/Avatar'
import { fetchSchoolSettings } from '@/services/settings.service'
import type { SchoolSettings } from '@/types/models'
import { cn } from '@/lib/utils'
import { supabase } from '@/services/client'

export function DashboardLayout() {
  const { profile, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [branding, setBranding] = useState<SchoolSettings | null>(null)
  const [extra, setExtra] = useState<{ email: string | null; phone: string | null }>({ email: null, phone: null })

  useEffect(() => {
    let active = true
    fetchSchoolSettings()
      .then((s) => active && setBranding(s))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    let active = true
    const loadExtra = async () => {
      try {
        const { data: student } = await supabase.from('students').select('email, phone').eq('profile_id', profile.id).maybeSingle()
        if (student && (student.email || student.phone)) {
          if (active) setExtra({ email: (student.email as string | null) ?? null, phone: (student.phone as string | null) ?? null })
          return
        }
        const { data: teacher } = await supabase.from('teachers').select('email, phone').eq('profile_id', profile.id).maybeSingle()
        if (active) setExtra({ email: (teacher?.email as string | null) ?? null, phone: (teacher?.phone as string | null) ?? null })
      } catch {
        // ignore, fallback to username
      }
    }
    void loadExtra()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  if (!profile) return null
  const items = getNav(profile.role)

  const handleSignOut = async () => {
    await signOut()
    toast.info('Anda telah keluar.')
    navigate('/login', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-slate-100 px-4 dark:border-slate-800">
        <BrandMark appName={branding?.app_name} schoolName={branding?.school_name} />
      </div>
      <SidebarNav items={items} onNavigate={() => setDrawerOpen(false)} />
      <Link to={`/${profile.role}/profile`} onClick={() => setDrawerOpen(false)} className="block border-t border-slate-100 bg-slate-50/80 px-4 py-3 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800 group dark:hover:bg-slate-700">
        <div className="flex items-center gap-3">
          <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" shape="xl" className="shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-none text-slate-900 dark:text-slate-100">{profile.full_name}</p>
            <p className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400" title={extra.email ?? `@${profile.username}`}>{extra.email ?? `@${profile.username}`}</p>
          </div>
          <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 group-hover:text-primary-600 dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-500 sm:flex dark:hover:text-primary-300 dark:group-hover:text-primary-300">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </div>
      </Link>
      <div className="border-t border-slate-100 px-5 py-2.5 dark:border-slate-800">
        <p className="text-[10px] leading-relaxed text-slate-300 dark:text-slate-500">SMK AL-FATA CBT v1.0</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 overflow-visible">
      <FullscreenPrompt role={profile.role} />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" />
          <div className={cn('absolute inset-y-0 left-0 w-72 bg-white shadow-2xl animate-slide-in-right dark:bg-slate-900')}>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Tutup"
              className="absolute top-4 right-3 rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-h-dvh flex-col lg:pl-64 overflow-visible">
        <Topbar profile={profile} extra={extra} onMenuClick={() => setDrawerOpen(true)} onSignOut={handleSignOut} />
        <div className="pt-14 sm:pt-16 flex-1 overflow-visible">
          <main id="main-content" className="w-full flex-1 bg-slate-50 px-4 py-4 pb-40 dark:bg-slate-950 sm:px-5 lg:px-6 lg:py-6 lg:pb-6 safe-bottom overflow-visible">
            <div className="w-full overflow-visible">
              <Outlet />
            </div>
          </main>
        </div>
        <BottomNav role={profile.role} onMoreClick={() => setDrawerOpen(true)} />
      </div>
    </div>
  )
}

export function SimpleLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-slate-50 dark:bg-slate-800 dark:text-slate-200">{children}</div>
}
