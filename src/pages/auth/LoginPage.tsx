import { useState, useRef, useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, User, Lock, Eye, EyeOff, ShieldCheck, Clock, Zap, Sparkles, GraduationCap, Users, TrendingUp } from 'lucide-react'
import { Spinner } from '@/components/ui/Feedback'
import { useAuth } from '@/hooks/useAuth'
import { signInWithUsername } from '@/services/auth.service'
import { getSetupStatus } from '@/services/setup.service'
import { isEnvConfigured } from '@/services/client'
import { fetchSchoolSettings, applyBranding } from '@/services/settings.service'
import { friendlyError } from '@/lib/errors'
import { ROLE_HOME } from '@/lib/constants'
import { useDocumentTitle, useAsync } from '@/hooks/useAsync'
import { getDefaultLogo } from '@/lib/logo'

interface Dot { x: number; y: number; r: number; vx: number; vy: number }

function GridAnimation({ primary, secondary }: { primary: string; secondary: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotsRef = useRef<Dot[]>([])
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const w = () => canvas.offsetWidth
    const h = () => canvas.offsetHeight

    const hexToRgb = (hex: string) => {
      const c = hex.replace('#', '')
      return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) }
    }
    const pRgb = hexToRgb(primary)
    const sRgb = hexToRgb(secondary)

    const spawnDots = () => {
      const count = Math.floor((w() * h()) / 16000)
      return Array.from({ length: Math.max(16, Math.min(90, count)) }, () => ({
        x: Math.random() * w(),
        y: Math.random() * h(),
        r: Math.random() * 1.6 + 0.8,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
      }))
    }
    dotsRef.current = spawnDots()

    let t = 0
    const draw = () => {
      ctx.clearRect(0, 0, w(), h())
      t += 0.004
      const dots = dotsRef.current

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]
        d.x += d.vx; d.y += d.vy
        if (d.x < 0) d.x = w(); if (d.x > w()) d.x = 0
        if (d.y < 0) d.y = h(); if (d.y > h()) d.y = 0

        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i * 0.7)
        const rgb = i % 3 === 0 ? sRgb : pRgb
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r + pulse * 0.7, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`
        ctx.fill()
      }

      const connectDist = 140
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < connectDist) {
            const alpha = 0.14 * (1 - dist / connectDist)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`
            ctx.lineWidth = 0.7
            ctx.stroke()
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize) }
  }, [primary, secondary])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }} aria-hidden />
}

export default function LoginPage() {
  const { profile, refresh } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  useDocumentTitle('Login')

  const [username, setUsername] = useState(() => {
    const prefill = (location.state as { prefillUsername?: string } | null)?.prefillUsername
    return prefill ?? ''
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t) }, [])

  const { data: branding } = useAsync(() => fetchSchoolSettings().then((s) => { applyBranding(s); return s }), [])
  const setupCheck = useAsync(() => getSetupStatus(), [])
  const loginBg = ((branding as unknown as { login_color?: string } | null)?.login_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { login_color: string }).login_color) ? (branding as unknown as { login_color: string }).login_color : '#0B1E24') as string
  const primary = ((branding as unknown as { primary_color?: string } | null)?.primary_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { primary_color: string }).primary_color) ? (branding as unknown as { primary_color: string }).primary_color : '#0D868F') as string
  const secondary = ((branding as unknown as { secondary_color?: string } | null)?.secondary_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { secondary_color: string }).secondary_color) ? (branding as unknown as { secondary_color: string }).secondary_color : '#2DD4BF') as string
  const appBg = ((branding as unknown as { app_bg_color?: string } | null)?.app_bg_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { app_bg_color: string }).app_bg_color) ? (branding as unknown as { app_bg_color: string }).app_bg_color : '#EDEDED') as string

  if (!isEnvConfigured()) return <Navigate to="/env-required" replace />
  if (setupCheck.loading && !setupCheck.error) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ background: appBg }}>
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  const setupUnavailable = Boolean(setupCheck.error)
  if (!setupUnavailable && setupCheck.data === true && !profile) return <Navigate to="/setup" replace />
  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (!username.trim() || !password) { setError('Username dan password wajib diisi.'); return }
    setLoading(true)
    try {
      const signedIn = await signInWithUsername(username.trim(), password)
      await refresh()
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : ROLE_HOME[signedIn.role] ?? '/', { replace: true })
    } catch (err) { setError(friendlyError(err)) } finally { setLoading(false) }
  }

  const logo = getDefaultLogo()
  const appName = branding?.app_name ?? 'Veyra CBT'
  const schoolName = branding?.school_name ?? 'SMK AL-FATA'

  return (
    <div className="relative flex min-h-dvh overflow-hidden" style={{ background: `linear-gradient(135deg, ${lighten(appBg, 0.05)} 0%, ${appBg} 55%, ${lighten(appBg, 0.02)} 100%)` }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full opacity-20 blur-3xl animate-blob" style={{ background: `radial-gradient(circle, ${primary}, transparent 70%)` }} />
        <div className="absolute -bottom-40 -right-24 h-[520px] w-[520px] rounded-full opacity-20 blur-3xl animate-blob" style={{ background: `radial-gradient(circle, ${secondary}, transparent 70%)`, animationDelay: '-6s' }} />
        <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.25) 1px, transparent 0)', backgroundSize: '26px 26px' }} />
      </div>

      <div
        className="relative hidden w-[54%] flex-col justify-between overflow-hidden p-10 xl:p-14 lg:flex xl:w-[58%]"
        style={{ background: `linear-gradient(155deg, ${loginBg} 0%, ${darken(loginBg, 0.14)} 60%, ${darken(primary, 0.28)} 130%)` }}
      >
        <GridAnimation primary={primary} secondary={secondary} />
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl animate-blob" style={{ background: `radial-gradient(circle, ${secondary}, transparent 70%)` }} />
          <div className="absolute -bottom-28 -left-20 h-[360px] w-[360px] rounded-full opacity-20 blur-3xl animate-blob" style={{ background: `radial-gradient(circle, ${primary}, transparent 70%)`, animationDelay: '-7s' }} />
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white animate-twinkle"
              style={{ left: `${(i * 67) % 100}%`, top: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.4}s`, opacity: 0.6 }}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/40 to-transparent" aria-hidden />

        <div className={`relative z-10 flex items-center justify-between transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}>
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <span className="absolute inset-0 rounded-2xl blur-md opacity-50 animate-pulse-soft" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xl">
                <img src={logo} alt="Logo" className="h-7 w-7 object-contain" width={28} height={28} />
              </div>
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight text-white">{appName}</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">{schoolName}</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur xl:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-twinkle" /> Server Online
          </span>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className={`transition-all delay-100 duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" style={{ color: secondary }} /> Ujian Digital Sekolah
            </span>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tight text-white xl:text-7xl">
              Ujian
              <br />
              <span className="text-gradient-animated" style={{ backgroundImage: `linear-gradient(90deg, ${secondary}, #ffffff, ${primary}, ${secondary})` }}>
                Terukur.
              </span>
              <br />
              <span className="text-white/60">Tanpa Drama.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">
              Timer dari server, jawaban tersimpan otomatis tiap detik, dan pengawasan presisi. Fokus mengerjakan, sisanya kami jaga.
            </p>
          </div>

          <div className={`mt-8 grid max-w-md grid-cols-3 gap-3 transition-all delay-200 duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            {[
              { value: '100%', label: 'Autosave' },
              { value: '<1 dtk', label: 'Sinkron' },
              { value: '24/7', label: 'Siap Ujian' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/12 bg-white/[0.07] px-3 py-3 text-center backdrop-blur transition-transform hover:-translate-y-1">
                <p className="text-lg font-black tabular-nums text-white">{s.value}</p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-white/55">{s.label}</p>
              </div>
            ))}
          </div>

          <div className={`mt-6 flex flex-wrap gap-2.5 transition-all delay-300 duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}>
            {[
              { icon: ShieldCheck, text: 'Aman & Terenkripsi' },
              { icon: Clock, text: 'Timer Server Akurat' },
              { icon: Zap, text: 'Autosave Tiap Detik' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="group flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.07] px-3 py-2 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.12]">
                <Icon className="h-3.5 w-3.5 text-white transition-transform group-hover:scale-110" />
                <span className="text-xs font-semibold text-white/85">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`relative z-10 flex items-center justify-between text-xs text-white/40 transition-all delay-500 duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <span className="font-mono">© {new Date().getFullYear()} {schoolName}</span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <GraduationCap className="h-4 w-4" /> Dibuat untuk pembelajaran
          </span>
        </div>

        <div className="absolute right-6 top-1/2 z-10 hidden w-60 -translate-y-1/2 flex-col gap-3 xl:flex" aria-hidden>
          <div className={`rounded-2xl border border-white/12 bg-white/[0.08] p-3.5 shadow-2xl backdrop-blur-xl animate-float transition-all delay-300 duration-700 ${mounted ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}`}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">Ujian berlangsung</p>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[11px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-twinkle" /> Live
              </span>
            </div>
            <p className="mt-1.5 truncate text-sm font-bold text-white">PTS Ganjil · Matematika</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/60">
              <Users className="h-3 w-3" /> 128 dari 150 sudah mengumpulkan
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-[85%] rounded-full animate-gradient-pan" style={{ backgroundImage: `linear-gradient(90deg, ${primary}, ${secondary}, ${primary})`, backgroundSize: '200% 100%' }} />
            </div>
            <p className="mt-1.5 text-right font-mono text-[11px] font-bold tabular-nums text-white/70">85%</p>
          </div>
          <div className={`rounded-2xl border border-white/12 bg-white/[0.08] p-3.5 shadow-2xl backdrop-blur-xl animate-float-soft transition-all delay-500 duration-700 ${mounted ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}`} style={{ animationDelay: '-2.5s' }}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
                <TrendingUp className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold text-white">Rata-rata 87,5</p>
                <p className="text-[11px] text-white/55">96% siswa di atas KKM</p>
              </div>
            </div>
            <div className="mt-3 flex h-10 items-end gap-1">
              {[35, 55, 42, 68, 58, 82, 95].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-white/25"
                  style={{ height: `${h}%`, opacity: 0.45 + (i / 7) * 0.55, background: i >= 5 ? secondary : undefined }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden>
          <div className="absolute -top-24 left-1/2 h-72 w-[130%] -translate-x-1/2 rounded-[100%] opacity-25 blur-3xl animate-blob" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
        </div>

        <div className={`relative z-10 w-full max-w-sm transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}>
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <div className="relative mb-4 animate-pop">
              <span className="absolute inset-0 rounded-3xl blur-xl opacity-40 animate-pulse-soft" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-2xl">
                <img src={logo} alt="Logo" className="h-10 w-10 object-contain" width={40} height={40} />
              </div>
              <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-lg animate-twinkle" style={{ background: secondary }}>
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            </div>
            <h1 className="bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-2xl font-black tracking-tight text-transparent dark:from-white dark:to-slate-400">{appName}</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-400">{schoolName}</p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-[0_24px_60px_-16px_rgba(11,30,36,0.25)] backdrop-blur-xl animate-rise dark:border-slate-700/60 dark:bg-slate-900/90">
            <div className="h-1 w-full animate-gradient-pan" style={{ backgroundImage: `linear-gradient(90deg, ${primary}, ${secondary}, ${primary})`, backgroundSize: '200% 100%' }} />
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-15 blur-2xl animate-blob" style={{ background: secondary }} aria-hidden />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-44 w-44 rounded-full opacity-15 blur-2xl animate-blob" style={{ background: primary, animationDelay: '-5s' }} aria-hidden />

            <div className="relative p-7 sm:p-8">
              <div className="stagger mb-6">
                <p className="text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: primary }}>Masuk</p>
                <h2 className="mt-1.5 text-[26px] font-black leading-tight tracking-tight text-slate-900 dark:text-white">Selamat datang kembali</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Masukkan kredensial dari admin untuk mulai ujian</p>
              </div>

              {setupUnavailable && (
                <div className="mb-5 animate-rise rounded-2xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-800/50 dark:bg-amber-500/10">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Mode setup belum aktif</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-amber-600/90 dark:text-amber-200/70">{setupCheck.error}</p>
                </div>
              )}

              {error && (
                <div key={error} className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 animate-shake dark:border-rose-800/50 dark:bg-rose-500/10" role="alert">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[11px] font-black text-white">!</span>
                  <p className="text-[13px] font-semibold leading-snug text-rose-700 dark:text-rose-300">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="stagger space-y-4">
                <div>
                  <label htmlFor="username" className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-slate-700 dark:text-slate-200">
                    <User className="h-3.5 w-3.5" style={{ color: primary }} />
                    Username
                  </label>
                  <div className="group relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-all duration-200" style={{ color: focusedField === 'username' ? primary : '#94a3b8' }} />
                    <input
                      type="text"
                      id="username"
                      autoComplete="username"
                      autoCapitalize="none"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="contoh: budi.siswa"
                      required
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none backdrop-blur transition-all duration-200 placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-600"
                      style={focusedField === 'username' ? { borderColor: primary, boxShadow: `0 0 0 4px ${primary}1f`, background: '#fff' } : undefined}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-slate-700 dark:text-slate-200">
                    <Lock className="h-3.5 w-3.5" style={{ color: primary }} />
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-all duration-200" style={{ color: focusedField === 'password' ? primary : '#94a3b8' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="••••••••"
                      required
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-11 text-sm font-medium tracking-wide text-slate-800 outline-none backdrop-blur transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-600"
                      style={focusedField === 'password' ? { borderColor: primary, boxShadow: `0 0 0 4px ${primary}1f`, background: '#fff' } : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-xl p-1.5 transition-all hover:scale-110 hover:bg-slate-100 active:scale-95 dark:hover:bg-slate-700"
                      style={{ color: focusedField === 'password' ? primary : '#94a3b8' }}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-shine group relative mt-2 w-full overflow-hidden rounded-2xl py-3.5 text-sm font-extrabold text-white outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  style={{
                    background: loading ? '#94a3b8' : `linear-gradient(100deg, ${primary}, ${secondary}, ${primary})`,
                    backgroundSize: '200% 100%',
                    boxShadow: loading ? undefined : `0 10px 26px -8px ${primary}80`,
                  }}
                >
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Memproses...</>
                    ) : (
                      <><LogIn className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" /> Masuk ke Dashboard</>
                    )}
                  </span>
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Akun dibuat admin</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>

              <div className="mt-4 flex items-center justify-center gap-4 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Enkripsi</span>
                <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Waktu server</span>
                <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
                <span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Cepat</span>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center font-mono text-[11px] text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} {schoolName} · {appName}
          </p>
        </div>
      </div>
    </div>
  )
}

function lighten(hex: string, amount: number): string {
  const c = hex.replace('#', '')
  const r = Math.min(255, parseInt(c.substring(0, 2), 16) + Math.round(255 * amount))
  const g = Math.min(255, parseInt(c.substring(2, 4), 16) + Math.round(255 * amount))
  const b = Math.min(255, parseInt(c.substring(4, 6), 16) + Math.round(255 * amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function darken(hex: string, amount: number): string {
  const c = hex.replace('#', '')
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - Math.round(255 * amount))
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - Math.round(255 * amount))
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - Math.round(255 * amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
