import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getDefaultLogo, resolveLogoUrl, sanitizeLogoUrl } from '@/lib/logo'

export function SplashScreen({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible)
  const fallbackLogo = getDefaultLogo()
  const [logoReady, setLogoReady] = useState(false)
  useEffect(() => {
    const img = new Image()
    img.onload = () => setLogoReady(true)
    img.onerror = () => setLogoReady(true)
    img.src = fallbackLogo
  }, [fallbackLogo])
  const [branding, setBranding] = useState<{ app_name: string; school_name: string; logo_url: string | null; primary_color: string; secondary_color: string; splash_bg_color?: string } | null>(() => {
    try {
      if (typeof window === 'undefined') return null
      const raw = localStorage.getItem('cbt-branding')
      const c = raw ? (JSON.parse(raw) as { app_name?: string; school_name?: string; logo_url?: string; primary_color?: string; secondary_color?: string; splash_bg_color?: string }) : null
      if (!c?.app_name) return null
      const sanitized = sanitizeLogoUrl(c.logo_url)
      const splash = c.splash_bg_color && /^#[0-9a-fA-F]{6}$/.test(c.splash_bg_color) ? c.splash_bg_color : '#064247'
      if (!sanitized && c.logo_url) {
        try { const copy = { ...c, logo_url: undefined }; localStorage.setItem('cbt-branding', JSON.stringify(copy)) } catch { void 0 }
        return { app_name: c.app_name, school_name: c.school_name ?? 'SMK AL-FATA', logo_url: null, primary_color: c.primary_color || '#0D868F', secondary_color: c.secondary_color || '#2DD4BF', splash_bg_color: splash }
      }
      return { app_name: c.app_name, school_name: c.school_name ?? 'SMK AL-FATA', logo_url: c.logo_url ? resolveLogoUrl(c.logo_url) : null, primary_color: c.primary_color || '#0D868F', secondary_color: c.secondary_color || '#2DD4BF', splash_bg_color: splash }
    } catch { return null }
  })

  useEffect(() => {
    let cancelled = false
    const cached = (() => {
      try {
        const raw = localStorage.getItem('cbt-branding')
        const c = raw ? (JSON.parse(raw) as { app_name?: string; school_name?: string; logo_url?: string; primary_color?: string; secondary_color?: string; splash_bg_color?: string }) : null
        const sanitized = sanitizeLogoUrl(c?.logo_url)
        if (c && !sanitized) {
          c.logo_url = undefined
          try { localStorage.setItem('cbt-branding', JSON.stringify(c)) } catch { void 0 }
        } else if (c?.logo_url && sanitized) {
          c.logo_url = resolveLogoUrl(c.logo_url)
        }
        return c
      } catch (e: unknown) { void e; return null }
    })()
    if (cached?.app_name) setBranding({ app_name: cached.app_name, school_name: cached.school_name ?? 'SMK AL-FATA', logo_url: cached.logo_url ? resolveLogoUrl(cached.logo_url) : null, primary_color: cached.primary_color || '#0D868F', secondary_color: cached.secondary_color || '#2DD4BF', splash_bg_color: cached.splash_bg_color && /^#[0-9a-fA-F]{6}$/.test(cached.splash_bg_color) ? cached.splash_bg_color : '#064247' })
    import('@/services/settings.service').then(({ fetchSchoolSettings }) =>
      fetchSchoolSettings()
        .then((s) => {
          if (cancelled) return
          const cleanLogo = sanitizeLogoUrl(s.logo_url) ? resolveLogoUrl(s.logo_url) : null
          const splash = (s as unknown as { splash_bg_color?: string }).splash_bg_color && /^#[0-9a-fA-F]{6}$/.test((s as unknown as { splash_bg_color: string }).splash_bg_color) ? (s as unknown as { splash_bg_color: string }).splash_bg_color : '#064247'
          setBranding({ app_name: s.app_name, school_name: s.school_name, logo_url: cleanLogo, primary_color: s.primary_color || '#0D868F', secondary_color: s.secondary_color || '#2DD4BF', splash_bg_color: splash })
          try { localStorage.setItem('cbt-branding', JSON.stringify({ app_name: s.app_name, school_name: s.school_name, logo_url: cleanLogo ?? fallbackLogo, primary_color: s.primary_color, secondary_color: s.secondary_color, splash_bg_color: splash })) } catch (e: unknown) { void e }
        })
        .catch(() => undefined),
    )
    return () => { cancelled = true }
  }, [fallbackLogo])

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
  const sc = branding?.secondary_color || '#2DD4BF'
  const splashBg = (branding as unknown as { splash_bg_color?: string } | null)?.splash_bg_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { splash_bg_color: string }).splash_bg_color) ? (branding as unknown as { splash_bg_color: string }).splash_bg_color : 'var(--c-splash-bg, #064247)'

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden font-sans splash-panel',
        'will-change-[opacity] [transform:translateZ(0)]',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ background: `var(--c-splash-gradient, ${splashBg})`, transition: 'opacity 680ms cubic-bezier(0.22,1,0.36,1)', WebkitFontSmoothing: 'antialiased', overflow: 'hidden' } as React.CSSProperties}
    >
      <div className="absolute inset-0" style={{ background: `radial-gradient(900px 600px at 50% -10%, ${pc}2e, transparent 60%), linear-gradient(180deg, color-mix(in srgb, ${splashBg} 92%, white) 0%, ${splashBg} 55%, color-mix(in srgb, ${splashBg} 88%, black) 100%)` }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1.2px, transparent 0)', backgroundSize: '24px 24px' }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 select-none font-black tracking-[-0.06em] text-transparent" style={{ fontSize: 'clamp(110px, 26vw, 220px)', WebkitTextStroke: '1.2px rgba(255,255,255,0.07)' }}>VEYRA</div>
      <div className="pointer-events-none absolute -top-28 -right-28 h-[620px] w-[620px] rounded-full blur-[40px] will-change-transform" style={{ background: `${pc}24`, transform: 'translateZ(0)', animation: 'ssFloat 8s ease-in-out infinite' }} />
      <div className="pointer-events-none absolute -bottom-44 -left-44 h-[640px] w-[640px] rounded-full blur-[36px] will-change-transform" style={{ background: `${sc}1a`, animation: 'ssFloat 9s ease-in-out infinite reverse' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" style={{ animation: 'ssPulseRing 3s ease-out infinite' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.04]" style={{ animation: 'ssPulseRing 3s ease-out 0.6s infinite' }} />

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
        <div className="relative" style={{ animation: 'ssLogo 2.4s ease-in-out infinite' }}>
          <div className="absolute inset-0 -z-10 scale-[1.7] rounded-[22px] blur-[28px] will-change-transform" style={{ background: `${pc}2e`, transform: 'translateZ(0)' }} />
          <div
            className="flex h-[96px] w-[96px] items-center justify-center rounded-[22px] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.28)] ring-1 ring-white/90 will-change-transform"
            style={{ transform: 'translateZ(0)' }}
          >
            <img src={fallbackLogo} alt={`Logo ${branding?.app_name ?? 'Veyra CBT'}`} className={cn('h-[64px] w-[64px] object-contain bg-white transition-opacity duration-300', logoReady ? 'opacity-100' : 'opacity-0')} width={64} height={64} loading="eager" decoding="sync" />
          </div>
        </div>

        <h1 className="mt-7 text-[23px] font-black tracking-[-0.03em] text-white" style={{ letterSpacing: '-0.03em', animation: 'ssText 0.6s ease-out 0.2s both', textShadow: '0 1px 12px rgba(0,0,0,0.18)' }}>{branding?.app_name ?? 'Veyra CBT'}</h1>
        <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#8FD8DC', animation: 'ssText 0.6s ease-out 0.3s both' }}>{branding?.school_name ? `${branding.school_name} • CBT` : 'Computer Based Test'}</p>
        <p className="mt-2 max-w-[360px] text-xs leading-relaxed text-white" style={{ animation: 'ssText 0.6s ease-out 0.4s both' }}>Sistem Ujian Digital — Aman, Cepat, Terintegrasi untuk Guru &amp; Siswa</p>

        <div className="mt-8 flex items-center gap-2.5" aria-label="Memuat" style={{ animation: 'ssText 0.5s ease-out 0.5s both' }}>
          <span className="h-2 w-2 rounded-full shadow-sm will-change-transform" style={{ background: sc, boxShadow: `0 0 8px ${sc}66`, animation: 'ssDotPro 1.1s cubic-bezier(0.4,0,0.2,1) infinite' }} />
          <span className="h-2 w-2 rounded-full shadow-sm will-change-transform" style={{ background: pc, boxShadow: `0 0 8px ${pc}4d`, animation: 'ssDotPro 1.1s cubic-bezier(0.4,0,0.2,1) 0.16s infinite' }} />
          <span className="h-2 w-2 rounded-full shadow-sm will-change-transform" style={{ background: pc, boxShadow: `0 0 8px ${pc}4d`, animation: 'ssDotPro 1.1s cubic-bezier(0.4,0,0.2,1) 0.32s infinite' }} />
        </div>

        <div className="relative mt-5 h-[6px] w-48 overflow-hidden rounded-full bg-white/12 p-[2px] shadow-inner" style={{ animation: 'ssText 0.5s ease-out 0.55s both' }}>
          <div className="h-full w-full overflow-hidden rounded-full">
            <div
              className="h-full w-[44%] rounded-full will-change-transform"
              style={{ background: `linear-gradient(90deg, ${pc}, ${sc}, ${pc})`, transform: 'translateZ(0)', animation: 'ssBarPro 1.2s cubic-bezier(0.4,0,0.6,1) infinite alternate', boxShadow: `0 0 10px ${pc}66` }}
            />
          </div>
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0" style={{ animation: 'ssShine 1.6s ease-in-out infinite' }} />
        </div>
        <p className="mt-3 font-mono text-[11px] tracking-[0.06em] text-white/55" style={{ animation: 'ssText 0.5s ease-out 0.6s both' }}>Memuat sistem ujian…</p>
      </div>

      <div className="absolute bottom-5 flex flex-col items-center gap-1.5 px-4 text-center" style={{ transition: 'opacity 560ms ease 200ms', opacity: visible ? 1 : 0 }}>
        <p className="font-mono text-[10px] tracking-[0.14em] text-white/35">{branding?.school_name ?? 'SMK AL-FATA'}</p>
        <p className="font-mono text-[11px] text-white/45">© 2026 {branding?.app_name ?? 'Veyra CBT'}</p>
      </div>

      <style>{`@keyframes ssDotPro{0%,100%{opacity:1;transform:scale(1) translateY(0)}50%{opacity:.42;transform:scale(.76) translateY(1px)}}@keyframes ssBarPro{0%{transform:translateX(-18%)}100%{transform:translateX(132%)}}@keyframes ssShine{0%{transform:translateX(-100%);opacity:0}50%{opacity:1}100%{transform:translateX(100%);opacity:0}}@keyframes ssLogo{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}@keyframes ssBadge{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.06) rotate(2deg)}}@keyframes ssText{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes ssFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(-10px,12px)}}@keyframes ssPulseRing{0%{transform:translate(-50%,-50%) scale(0.9);opacity:0.6}100%{transform:translate(-50%,-50%) scale(1.12);opacity:0}}@media (prefers-reduced-motion:reduce){[style*="animation: ss"]{animation:none!important}}`}</style>
    </div>
  )
}
