import { useNavigate } from 'react-router-dom'
import { Bell, LogOut, ChevronDown, MessageSquare, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Profile, UserRole } from '@/types/models'
import { roleLabel } from '@/services/auth.service'
import { listMyNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/notifications.service'
import { relativeTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Breadcrumb } from './Breadcrumb'
import { ChatAiCard } from '@/components/ai/ChatAiCard'
import { supabase } from '@/services/client'

function NetworkPing() {
  const [ping, setPing] = useState<number | null>(null)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  useEffect(() => {
    let active = true
    const check = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOnline(false)
        setPing(null)
        return
      }
      const start = performance.now()
      const url = new URL('logo.webp', window.location.origin).toString()
      const doFetch = async (method: 'HEAD' | 'GET') => {
        const ctrl = new AbortController()
        const t = window.setTimeout(() => ctrl.abort(), 2500)
        try {
          const res = await fetch(url, { cache: 'no-store', method, signal: ctrl.signal })
          return res.ok
        } finally {
          window.clearTimeout(t)
        }
      }
      try {
        let ok = await doFetch('HEAD')
        if (!ok) ok = await doFetch('GET')
        if (!active) return
        if (ok) {
          setPing(Math.round(performance.now() - start))
          setOnline(true)
        } else {
          setPing(null)
          setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
        }
      } catch {
        if (!active) return
        // fallback: if offline API says online, treat as online with no ping
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
        setOnline(isOnline)
        setPing(isOnline ? 0 : null)
      }
    }
    check()
    const id = window.setInterval(check, 4000)
    // also re-check on visibility change
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  const label = !online ? 'Offline' : ping === null ? '…' : `${ping}ms`
  const tone = !online ? 'text-slate-500' : ping === null ? 'text-slate-400' : ping < 120 ? 'text-emerald-600' : ping < 300 ? 'text-amber-600' : 'text-rose-600'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${tone}`} title={`Ping jaringan: ${label}`}>
      {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      <span>{label}</span>
    </span>
  )
}

export function Topbar({
  profile,
  extra,
  onMenuClick,
  onSignOut,
}: {
  profile: Profile
  extra?: { phone: string | null; email?: string | null }
  onMenuClick: () => void
  onSignOut: () => Promise<void>
}) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifs, setNotifs] = useState<{ id: string; title: string; body: string | null; is_read: boolean; created_at: string }[]>([])
  const notifRef = useRef<HTMLDivElement>(null)
  const notifButtonRef = useRef<HTMLButtonElement>(null)
  const notifCardRef = useRef<HTMLDivElement>(null)
  const [notifPos, setNotifPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    const load = () => {
      if (!active) return
      listMyNotifications(12)
        .then(setNotifs)
        .catch(() => undefined)
    }
    load()
    const interval = window.setInterval(load, 60000)
    const ch = supabase
      .channel(`notifs-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` }, (payload) => {
        if (!active) return
        const row = payload.new as { id: string; title: string; body: string | null; is_read: boolean; created_at: string }
        setNotifs((prev) => [row, ...prev].slice(0, 12))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` }, () => load())
      .subscribe()
    return () => {
      active = false
      window.clearInterval(interval)
      void supabase.removeChannel(ch)
    }
  }, [profile.id])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      const inNotif = notifRef.current?.contains(target) || notifCardRef.current?.contains(target)
      if (!inNotif) setNotifOpen(false)
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (!notifOpen) {
      setNotifPos(null)
      return
    }
    const rect = notifButtonRef.current?.getBoundingClientRect()
    const cardW = 360
    const cardH = 420
    const pad = 8
    const minY = 72
    let x = rect ? rect.right - cardW : window.innerWidth - cardW - 16
    let y = rect ? rect.bottom + 8 : 72
    x = Math.max(pad, Math.min(x, window.innerWidth - cardW - pad))
    y = Math.max(minY, Math.min(y, window.innerHeight - cardH - pad))
    setNotifPos({ x, y })
  }, [notifOpen])

  useEffect(() => {
    if (!notifOpen || !notifPos) return
    const onResize = () => {
      const card = notifCardRef.current
      const w = card?.offsetWidth ?? 360
      const h = card?.offsetHeight ?? 420
      const pad = 8
      const minY = 72
      let nx = notifPos.x
      let ny = notifPos.y
      nx = Math.max(pad, Math.min(nx, window.innerWidth - w - pad))
      ny = Math.max(minY, Math.min(ny, window.innerHeight - h - pad))
      if (nx !== notifPos.x || ny !== notifPos.y) setNotifPos({ x: nx, y: ny })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [notifOpen, notifPos])

  const handleNotifDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const isTouch = 'touches' in e
    const clientX = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY
    const card = notifCardRef.current
    if (!card || !notifPos) return
    dragRef.current = { dragging: true, offsetX: clientX - notifPos.x, offsetY: clientY - notifPos.y }
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY
      const cur = dragRef.current
      if (!cur?.dragging) return
      const cardEl = notifCardRef.current
      const w = cardEl ? cardEl.offsetWidth : 360
      const h = cardEl ? cardEl.offsetHeight : 420
      const pad = 8
      const minY = 72
      let nx = cx - cur.offsetX
      let ny = cy - cur.offsetY
      nx = Math.max(pad, Math.min(nx, window.innerWidth - w - pad))
      ny = Math.max(minY, Math.min(ny, window.innerHeight - h - pad))
      setNotifPos({ x: nx, y: ny })
    }
    const onUp = () => {
      if (dragRef.current) dragRef.current.dragging = false
      window.removeEventListener('mousemove', onMove as unknown as EventListener)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as unknown as EventListener)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove as unknown as EventListener)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as unknown as EventListener, { passive: false } as AddEventListenerOptions)
    window.addEventListener('touchend', onUp)
  }

  const unread = notifs.filter((n) => !n.is_read).length
  const [chatOpen, setChatOpen] = useState(false)
  const chatButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <header className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center gap-2 border-b border-slate-200/50 bg-white/95 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:gap-3 sm:px-6 lg:left-64">
      <button
        onClick={onMenuClick}
        aria-label="Buka menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 tap-target dark:text-slate-300 dark:hover:bg-slate-800 sm:rounded-xl lg:hidden dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
      <NetworkPing />

      <div className="hidden sm:flex min-w-0 flex-1">
        <Breadcrumb />
      </div>
      <div className="flex min-w-0 flex-1 items-center sm:hidden" />

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {profile.role !== 'student' && (
          <button
            ref={chatButtonRef}
            onClick={() => {
              setChatOpen((o) => !o)
              setNotifOpen(false)
              setMenuOpen(false)
            }}
            aria-label="Chat AI"
            aria-expanded={chatOpen}
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:hover:border-slate-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:dark:border-slate-700 sm:dark:bg-slate-900 sm:dark:hover:border-slate-600 dark:hover:bg-slate-700"
          >
            <MessageSquare className="h-[18px] w-[18px]" />
          </button>
        )}
        <ThemeToggle />

        <div className="relative" ref={notifRef}>
        <button
          ref={notifButtonRef}
          onClick={() => {
            setNotifOpen((o) => !o)
            setMenuOpen(false)
          }}
          aria-label="Notifikasi"
          aria-expanded={notifOpen}
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:hover:border-slate-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:dark:border-slate-700 sm:dark:bg-slate-900 sm:dark:hover:border-slate-600 dark:hover:bg-slate-700"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        {notifOpen && (
          <div
            ref={notifCardRef}
            style={notifPos ? { left: notifPos.x, top: notifPos.y, position: 'fixed' } : undefined}
            className={`${notifPos ? 'fixed' : 'absolute right-0 mt-2'} z-50 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-scale-in dark:border-slate-700 dark:bg-slate-900`}
          >
            <div
              onMouseDown={handleNotifDragStart}
              onTouchStart={handleNotifDragStart}
              className="flex cursor-grab select-none items-center justify-between border-b border-slate-100 bg-gradient-to-r from-primary-600 to-sky-500 px-4 py-3 text-white active:cursor-grabbing dark:border-slate-800"
              style={{ touchAction: 'none' }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <span className="hidden sm:inline text-slate-400 dark:text-slate-500" aria-hidden>⠿</span> Notifikasi
                <span className="hidden text-[10px] font-normal text-slate-400 sm:inline">— geser untuk pindah</span>
              </p>
              {unread > 0 && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={async () => {
                    await markAllNotificationsRead()
                    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })))
                  }}
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 dark:hover:bg-slate-800"
                  aria-label="Tandai semua dibaca"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setNotifOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 dark:hover:bg-slate-800"
                aria-label="Tutup"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {notifs.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-400">Belum ada notifikasi.</p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      if (!n.is_read) {
                        await markNotificationRead(n.id)
                        setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
                      }
                      setNotifOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800',
                      !n.is_read && 'bg-primary-50/40 dark:bg-primary-500/10',
                    )}
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-slate-200' : 'bg-primary-500')} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-400">{n.body}</span>}
                      <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-300">{relativeTime(n.created_at)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => {
            setMenuOpen((o) => !o)
            setNotifOpen(false)
          }}
          aria-expanded={menuOpen}
          aria-label="Menu akun"
          className="flex items-center justify-center p-0.5 transition-colors rounded-full sm:gap-2.5 sm:rounded-xl sm:border sm:border-transparent sm:p-1.5 sm:hover:border-slate-200 sm:hover:bg-slate-100 sm:dark:border-transparent sm:dark:hover:border-slate-700 sm:dark:hover:bg-slate-800 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
        >
          <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" shape="full" className="sm:!rounded-xl" />
          <span className="hidden text-left md:block">
            <span className="block max-w-[160px] truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{profile.full_name}</span>
            <span className="block max-w-[160px] truncate text-[11px] font-medium text-slate-400">{extra?.phone ?? extra?.email ?? `@${profile.username}`}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl animate-scale-in dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{profile.full_name}</p>
              <p className="truncate text-xs text-slate-400">@{profile.username}{extra?.phone ? ` · ${extra.phone}` : ''}</p>
              {extra?.email && <p className="truncate text-[11px] text-slate-400">{extra.email}</p>}
            </div>
            <button
              onClick={() => {
                navigate(`/${profile.role === 'admin' ? 'admin' : profile.role}/profile`)
                setMenuOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:bg-slate-800 dark:text-slate-200"
            >
              Profil Saya
            </button>
            <button
              onClick={async () => {
                setMenuOpen(false)
                await onSignOut()
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" /> Keluar
            </button>
          </div>
        )}
      </div>
      </div>
      {profile.role !== 'student' && <ChatAiCard open={chatOpen} onClose={() => setChatOpen(false)} anchorRef={chatButtonRef} />}
    </header>
  )
}

export function BrandMark({ appName, schoolName }: { appName?: string; schoolName?: string }) {
  const [logo, setLogo] = useState<string | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cbt-branding')
      if (raw) {
        const b = JSON.parse(raw) as { logo_url?: string }
        if (b.logo_url) setLogo(b.logo_url)
      }
    } catch (_e) { void _e }
    import('@/services/settings.service').then(({ fetchSchoolSettings }) =>
      fetchSchoolSettings().then((s) => { if (s.logo_url) setLogo(s.logo_url) }).catch(() => undefined),
    )
  }, [])
  return (
    <div className="flex items-center gap-3 px-2">
      <img src={logo || `${import.meta.env.BASE_URL}logo.webp`} alt="Logo" className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700" width={36} height={36} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{schoolName ?? 'SMK AL-FATA'}</p>
        <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{appName ?? 'SMK AL-FATA CBT'}</p>
      </div>
    </div>
  )
}

export function RoleBadge({ role }: { role: UserRole }) {
  const map: Record<UserRole, string> = {
    admin: 'bg-violet-50 text-violet-700',
    teacher: 'bg-sky-50 text-sky-700',
    student: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', map[role])}>{roleLabel(role)}</span>
  )
}
