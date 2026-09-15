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
      .then((s) => {
        if (!active) return
        setBranding(s)
        import('@/services/settings.service').then(({ applyBranding }) => applyBranding(s)).catch(() => undefined)
      })
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
  const sidebarBg = ((branding as unknown as { sidebar_color?: string } | null)?.sidebar_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { sidebar_color: string }).sidebar_color) ? (branding as unknown as { sidebar_color: string }).sidebar_color : '#0D868F') as string
  const appBg = ((branding as unknown as { app_bg_color?: string } | null)?.app_bg_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { app_bg_color: string }).app_bg_color) ? (branding as unknown as { app_bg_color: string }).app_bg_color : '#EDEDED') as string
  const primary = ((branding as unknown as { primary_color?: string } | null)?.primary_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { primary_color: string }).primary_color) ? (branding as unknown as { primary_color: string }).primary_color : '#0D868F') as string
  const secondary = ((branding as unknown as { secondary_color?: string } | null)?.secondary_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { secondary_color: string }).secondary_color) ? (branding as unknown as { secondary_color: string }).secondary_color : '#2DD4BF') as string

  const handleSignOut = async () => {
    await signOut()
    toast.info('Anda telah keluar.')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh overflow-visible selection:bg-primary-500/10 app-bg" style={{ background: `var(--c-app-gradient, ${appBg})` }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.035] dark:opacity-[0.05]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #0B1E24 1px, transparent 0)`, backgroundSize: '22px 22px' }} />
        <div className="absolute -top-24 right-[-80px] h-[420px] w-[420px] rounded-full blur-3xl lg:h-[520px] lg:w-[520px]" style={{ background: `linear-gradient(135deg, ${primary}14, ${secondary}14, transparent)` }} />
        <div className="absolute -bottom-32 left-[280px] h-[380px] w-[380px] rounded-full blur-3xl lg:h-[480px] lg:w-[480px]" style={{ background: `linear-gradient(135deg, ${primary}0f, ${secondary}0f, transparent)` }} />
      </div>
      <FullscreenPrompt role={profile.role} />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden border-r border-white/10 dark:border-white/8 lg:flex sidebar-panel" style={{ background: `var(--c-sidebar-gradient, ${sidebarBg})` }}>
        <div className="relative flex h-full flex-col">
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, backgroundSize: '20px 20px' }} />
          <div className="relative flex h-16 items-center border-b border-white/10 px-4">
            <BrandMark appName={branding?.app_name} schoolName={branding?.school_name} />
          </div>
          <SidebarNav items={items} onNavigate={() => setDrawerOpen(false)} />
          <Link to={`/${profile.role}/profile`} onClick={() => setDrawerOpen(false)} className="relative flex items-center gap-3 border-t border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur transition-colors hover:bg-white/[0.06]">
            <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" shape="xl" className="shadow-sm ring-1 ring-white/10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-none text-white">{profile.full_name}</p>
              <p className="truncate text-xs leading-tight text-white/60" title={extra.email ?? `@${profile.username}`}>{extra.email ?? `@${profile.username}`}</p>
            </div>
            <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#0B1E24] shadow-sm sm:flex">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </span>
          </Link>
        </div>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 backdrop-blur-sm animate-fade-in" style={{ backgroundColor: `${sidebarBg}99` }} />
          <div className={cn('absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col overflow-hidden rounded-r-[24px] shadow-2xl animate-slide-in-right sidebar-panel')} style={{ background: `var(--c-sidebar-gradient, ${sidebarBg})` }}>
            <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, backgroundSize: '20px 20px' }} />
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Tutup"
              className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/80 backdrop-blur transition-colors hover:bg-white/15 active:scale-95 tap-target"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative flex h-full flex-col pt-2">
              <div className="px-4 pb-3 pt-8">
                <BrandMark appName={branding?.app_name} schoolName={branding?.school_name} />
              </div>
              <SidebarNav items={items} onNavigate={() => setDrawerOpen(false)} />
              <div className="mt-auto border-t border-white/10 p-4">
                <div className="rounded-2xl bg-white p-3 shadow-sm">
                  <Link to={`/${profile.role}/profile`} onClick={() => setDrawerOpen(false)} className="flex items-center gap-3">
                    <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" shape="xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#0B1E24]">{profile.full_name}</p>
                      <p className="truncate text-xs text-slate-500">@{profile.username}</p>
                    </div>
                    <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 sm:flex">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </span>
                  </Link>
                  <button
                    onClick={async () => { setDrawerOpen(false); await handleSignOut() }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 py-2.5 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-100 active:scale-[0.98]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Keluar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-dvh flex-col lg:pl-64 overflow-visible">
        <Topbar profile={profile} extra={extra} onMenuClick={() => setDrawerOpen(true)} onSignOut={handleSignOut} />
        <div className="flex-1 overflow-visible pt-16 lg:pt-[64px]">
          <main id="main-content" className="relative w-full flex-1 px-4 py-4 dark:bg-[#070D14] sm:px-5 lg:px-8 lg:py-7 safe-bottom overflow-visible app-bg" style={{ background: `var(--c-app-gradient, ${appBg})` }}>
            <div className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.04]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #0B1E24 1px, transparent 0)`, backgroundSize: '22px 22px' }} />
            <div className="relative w-full overflow-visible pb-24 lg:pb-0">
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
