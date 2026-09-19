import { useState, useRef, useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, User, Lock, Eye, EyeOff, ShieldCheck, Clock } from 'lucide-react'
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

    const dpr = window.devicePixelRatio ?? 1
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
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
      const count = Math.floor((w() * h()) / 18000)
      return Array.from({ length: Math.max(12, count) }, () => ({
        x: Math.random() * w(),
        y: Math.random() * h(),
        r: Math.random() * 1.5 + 0.8,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
      }))
    }
    dotsRef.current = spawnDots()

    let t = 0
    const draw = () => {
      ctx.clearRect(0, 0, w(), h())
      t += 0.003
      const dots = dotsRef.current

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]
        d.x += d.vx; d.y += d.vy
        if (d.x < 0) d.x = w(); if (d.x > w()) d.x = 0
        if (d.y < 0) d.y = h(); if (d.y > h()) d.y = 0

        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i * 0.7)
        const rgb = i % 3 === 0 ? sRgb : pRgb
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r + pulse * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.5)`
        ctx.fill()
      }

      const connectDist = 130
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < connectDist) {
            const alpha = 0.12 * (1 - dist / connectDist)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize) }
  }, [primary, secondary])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />
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
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t) }, [])

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
    <div
      className="min-h-dvh relative overflow-hidden flex"
      style={{ background: `linear-gradient(135deg, ${lighten(appBg, 0.06)} 0%, ${appBg} 100%)` }}
    >
      {/* Subtle background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-10 blur-3xl"
          style={{ background: `radial-gradient(circle, ${primary}, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-10 blur-3xl"
          style={{ background: `radial-gradient(circle, ${secondary}, transparent 70%)` }}
        />
      </div>

      {/* Left Panel - Branding */}
      <div
        className="hidden lg:flex lg:w-[55%] xl:w-[60%] relative flex-col justify-between p-12 xl:p-16 overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${loginBg} 0%, ${darken(loginBg, 0.12)} 100%)` }}
      >
        <GridAnimation primary={primary} secondary={secondary} />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-[0.06] blur-3xl"
            style={{ background: `radial-gradient(circle, ${secondary}, transparent 70%)` }}
          />
          <div
            className="absolute bottom-0 left-0 w-[350px] h-[350px] rounded-full opacity-[0.05] blur-3xl"
            style={{ background: `radial-gradient(circle, ${primary}, transparent 70%)` }}
          />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg">
              <img src={logo} alt="Logo" className="w-7 h-7 object-contain" width={28} height={28} />
            </div>
            <div>
              <p className="font-bold text-lg tracking-tight text-white">{appName}</p>
              <p className="text-xs tracking-[0.15em] text-white/50">{schoolName}</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="text-5xl xl:text-7xl font-black leading-[0.9] tracking-tight mb-6 text-white">
            Ujian<br /><span className="opacity-60">Terukur.</span>
          </h1>
          <p className="text-sm leading-relaxed text-white/50 max-w-md mb-10">
            Sistem ujian digital yang aman, cepat, dan terpercaya. Waktu dari server, jawaban autosave tiap detik, pengawasan presisi.
          </p>
          <div className="flex gap-4">
            {[
              { icon: ShieldCheck, text: 'Aman & Terenkripsi' },
              { icon: Clock, text: 'Timer Server Akurat' },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/15"
              >
                <Icon className="w-3.5 h-3.5 text-white" />
                <span className="text-xs font-medium text-white/80">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs text-white/30 font-mono">
          <span>© {new Date().getFullYear()} {schoolName}</span>
          <span className="w-8 h-px bg-white/20" />
          <span>Profesional &bull; Aman &bull; Terpercaya</span>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 relative flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-[-10%] left-[-10%] w-[120%] h-[60%] rounded-full opacity-15 blur-3xl"
            style={{ background: `linear-gradient(135deg, ${primary}25, ${secondary}15, transparent)` }}
          />
        </div>

        <div className={`w-full max-w-sm relative z-10 transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div
                className="absolute inset-0 rounded-2xl blur-lg opacity-25"
                style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
              />
              <div className="relative w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-xl">
                <img src={logo} alt="Logo" className="w-10 h-10 object-contain" width={40} height={40} />
              </div>
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{appName}</h1>
            <p className="text-slate-400 text-xs font-mono tracking-widest mt-1">{schoolName}</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary}, ${primary})` }} />

            <div className="p-7 sm:p-8">
              <div className="mb-7">
                <p className="text-[10px] font-mono tracking-[0.2em] mb-2" style={{ color: primary }}>MASUK</p>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Selamat Datang</h2>
                <p className="mt-1.5 text-sm text-slate-400">Masukkan kredensial yang diberikan admin</p>
              </div>

              {setupUnavailable && (
                <div className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm font-semibold text-amber-700">Mode setup belum aktif</p>
                  <p className="text-xs text-amber-500 mt-1">{setupCheck.error}</p>
                </div>
              )}

              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                  <p className="text-sm font-medium text-rose-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                    <User className="w-3.5 h-3.5" style={{ color: primary }} />
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200" style={{ color: focusedField === 'username' ? primary : '#94a3b8' }}>
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      ref={usernameRef}
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
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-300 outline-none transition-all duration-200 text-sm"
                      style={{
                        borderColor: focusedField === 'username' ? primary : undefined,
                        boxShadow: focusedField === 'username' ? `0 0 0 3px ${primary}18` : undefined,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5" style={{ color: primary }} />
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200" style={{ color: focusedField === 'password' ? primary : '#94a3b8' }}>
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-300 outline-none transition-all duration-200 text-sm"
                      style={{
                        borderColor: focusedField === 'password' ? primary : undefined,
                        boxShadow: focusedField === 'password' ? `0 0 0 3px ${primary}18` : undefined,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors duration-200"
                      style={{ color: focusedField === 'password' ? primary : '#94a3b8' }}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-sm relative overflow-hidden group mt-6 text-white outline-none transition-all duration-200"
                  style={{
                    background: loading ? '#94a3b8' : `linear-gradient(135deg, ${primary}, ${secondary})`,
                    boxShadow: `0 4px 14px ${primary}25`,
                    minWidth: 0,
                  }}
                >
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Memproses...</>
                    ) : (
                      <><LogIn className="w-4 h-4" /> Masuk</>
                    )}
                  </span>
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300 font-mono tracking-wider">
                  <span className="w-6 h-px bg-slate-200" />
                  <span>AKUN DIBUAT ADMIN</span>
                  <span className="w-6 h-px bg-slate-200" />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-300 font-mono">
            &copy; {new Date().getFullYear()} {schoolName} &bull; Aman &amp; Terpercaya
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
