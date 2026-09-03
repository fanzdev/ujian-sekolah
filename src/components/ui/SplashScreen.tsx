import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function SplashScreen({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible)
  const [branding, setBranding] = useState<{ app_name: string; school_name: string; logo_url: string | null; primary_color: string; secondary_color: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const cached = (() => {
      try {
        const raw = localStorage.getItem('cbt-branding')
        return raw ? (JSON.parse(raw) as { app_name?: string; school_name?: string; logo_url?: string; primary_color?: string; secondary_color?: string }) : null
      } catch (e: unknown) { void e; return null }
    })()
    if (cached?.app_name) setBranding({ app_name: cached.app_name, school_name: cached.school_name ?? 'SMK AL-FATA', logo_url: cached.logo_url ?? null, primary_color: cached.primary_color || '#0D868F', secondary_color: cached.secondary_color || '#0CBCC9' })
    import('@/services/settings.service').then(({ fetchSchoolSettings }) =>
      fetchSchoolSettings()
        .then((s) => {
          if (cancelled) return
          setBranding({ app_name: s.app_name, school_name: s.school_name, logo_url: s.logo_url, primary_color: s.primary_color || '#0D868F', secondary_color: s.secondary_color || '#0CBCC9' })
          try { localStorage.setItem('cbt-branding', JSON.stringify({ app_name: s.app_name, school_name: s.school_name, logo_url: s.logo_url, primary_color: s.primary_color, secondary_color: s.secondary_color })) } catch (e: unknown) { void e }
        })
        .catch(() => undefined),
    )
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (visible) {
      const prevBody = document.body.style.overflow
      const prevHtml = document.documentElement.style.overflow
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevBody
        document.documentElement.style.overflow = prevHtml
      }
    }
  }, [visible])

  useEffect(() => {
    if (visible) setMounted(true)
    else {
      const t = window.setTimeout(() => setMounted(false), 720)
      return () => window.clearTimeout(t)
    }
  }, [visible])

  if (!mounted) return null

  const pc = branding?.primary_color || '#0D868F'
  const sc = branding?.secondary_color || '#0CBCC9'

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-white dark:bg-slate-950 font-sans',
        'will-change-[opacity] [transform:translateZ(0)]',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ transition: 'opacity 680ms cubic-bezier(0.22,1,0.36,1)', WebkitFontSmoothing: 'antialiased', overflow: 'hidden' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-[#070e22]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.055]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(100 116 139) 1px, transparent 0)', backgroundSize: '24px 24px' }}
      />
      <div className="pointer-events-none absolute -top-28 -right-28 h-[620px] w-[620px] rounded-full bg-primary-500/10 blur-3xl dark:bg-primary-500/[0.09] will-change-transform" style={{ transform: 'translateZ(0)', animation: 'ssFloat 8s ease-in-out infinite' }} />
      <div className="pointer-events-none absolute -bottom-44 -left-44 h-[640px] w-[640px] rounded-full blur-3xl will-change-transform" style={{ background: `${sc}1a`, animation: 'ssFloat 9s ease-in-out infinite reverse' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-200/20 dark:border-white/5" style={{ animation: 'ssPulseRing 3s ease-out infinite' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-300/10 dark:border-white/[0.03]" style={{ animation: 'ssPulseRing 3s ease-out 0.6s infinite' }} />

      <div
        className={cn(
          'relative flex flex-col items-center px-6 text-center will-change-[opacity,transform]',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.98)',
          transition: 'opacity 560ms cubic-bezier(0.22,1,0.36,1) 80ms, transform 620ms cubic-bezier(0.22,1,0.36,1) 80ms',
        }}
      >
        <div className="relative" style={{ animation: 'ssLogo 2.2s ease-in-out infinite' }}>
          <div className="absolute inset-0 -z-10 scale-[1.75] rounded-[2rem] blur-[30px] will-change-transform" style={{ background: `${pc}24`, transform: 'translateZ(0)' }} />
          <div
            className="flex h-[92px] w-[92px] items-center justify-center rounded-[20px] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800 will-change-transform"
            style={{ transform: 'translateZ(0)' }}
          >
            <img src={branding?.logo_url || `${import.meta.env.BASE_URL}logo.webp`} alt="Logo SMK AL-FATA" className="h-[60px] w-[60px] object-contain" width={60} height={60} loading="eager" decoding="sync" />
          </div>
        </div>

        <h1 className="mt-7 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-[22px] font-extrabold tracking-tight text-transparent dark:from-white dark:to-slate-300" style={{ letterSpacing: '-0.02em', animation: 'ssText 0.6s ease-out 0.2s both' }}>{branding?.app_name ?? 'SMK AL-FATA CBT'}</h1>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] dark:text-primary-300" style={{ color: pc, animation: 'ssText 0.6s ease-out 0.3s both' }}>{branding?.school_name ? `${branding.school_name} • CBT` : 'Computer Based Test'}</p>
        <p className="mt-2 max-w-[360px] text-xs leading-relaxed text-slate-500 dark:text-slate-400" style={{ animation: 'ssText 0.6s ease-out 0.4s both' }}>Sistem Ujian Digital — Aman, Cepat, Terintegrasi untuk Guru &amp; Siswa</p>

        <div className="mt-8 flex items-center gap-2.5" aria-label="Memuat" style={{ animation: 'ssText 0.5s ease-out 0.5s both' }}>
          <span className="h-2 w-2 rounded-full bg-primary-500 shadow-sm will-change-transform" style={{ boxShadow: `0 0 8px ${pc}4d`, animation: 'ssDotPro 1.1s cubic-bezier(0.4,0,0.2,1) infinite' }} />
          <span className="h-2 w-2 rounded-full bg-primary-500 shadow-sm will-change-transform" style={{ boxShadow: `0 0 8px ${pc}4d`, animation: 'ssDotPro 1.1s cubic-bezier(0.4,0,0.2,1) 0.16s infinite' }} />
          <span className="h-2 w-2 rounded-full bg-primary-500 shadow-sm will-change-transform" style={{ boxShadow: `0 0 8px ${pc}4d`, animation: 'ssDotPro 1.1s cubic-bezier(0.4,0,0.2,1) 0.32s infinite' }} />
        </div>

        <div className="relative mt-5 h-[6px] w-48 overflow-hidden rounded-full bg-slate-200/80 p-[2px] shadow-inner dark:bg-slate-800" style={{ animation: 'ssText 0.5s ease-out 0.55s both' }}>
          <div className="h-full w-full overflow-hidden rounded-full">
            <div
              className="h-full w-[44%] rounded-full will-change-transform"
              style={{ background: `linear-gradient(90deg, ${pc}, ${sc}, ${pc})`, transform: 'translateZ(0)', animation: 'ssBarPro 1.15s cubic-bezier(0.4,0,0.6,1) infinite alternate', boxShadow: `0 0 10px ${pc}66` }}
            />
          </div>
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0" style={{ animation: 'ssShine 1.6s ease-in-out infinite' }} />
        </div>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-slate-400 dark:text-slate-500" style={{ animation: 'ssText 0.5s ease-out 0.6s both' }}>Memuat sistem ujian…</p>
      </div>

      <div className="absolute bottom-5 flex flex-col items-center gap-1.5 px-4 text-center" style={{ transition: 'opacity 560ms ease 200ms', opacity: visible ? 1 : 0 }}>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-600">{branding?.school_name ?? 'SMK AL-FATA'} • v1.0 • Profesional • Aman • Cepat</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">© 2026 {branding?.app_name ?? 'SMK AL-FATA CBT'}</p>
      </div>

      <style>{`@keyframes ssDotPro{0%,100%{opacity:1;transform:scale(1) translateY(0)}50%{opacity:.42;transform:scale(.76) translateY(1px)}}@keyframes ssBarPro{0%{transform:translateX(-18%)}100%{transform:translateX(132%)}}@keyframes ssShine{0%{transform:translateX(-100%);opacity:0}50%{opacity:1}100%{transform:translateX(100%);opacity:0}}@keyframes ssLogo{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}@keyframes ssBadge{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.06) rotate(2deg)}}@keyframes ssText{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes ssFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(-10px,12px)}}@keyframes ssPulseRing{0%{transform:translate(-50%,-50%) scale(0.9);opacity:0.6}100%{transform:translate(-50%,-50%) scale(1.12);opacity:0}}@media (prefers-reduced-motion:reduce){[style*="animation: ss"]{animation:none!important}}`}</style>
    </div>
  )
}
