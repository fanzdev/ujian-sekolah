import { useState, type FormEvent, useRef, useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, User, Lock, Eye, EyeOff, Sparkles, ShieldCheck, Clock } from 'lucide-react'
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

interface Particle { x: number; y: number; size: number; speedX: number; speedY: number; opacity: number }

function AnimatedBackground({ primary: _primary, secondary: _secondary, loginBg: _loginBg }: { primary: string; secondary: string; loginBg: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Particle[]>([])
  const raf = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)
    const w = () => canvas.offsetWidth
    const h = () => canvas.offsetHeight

    particles.current = Array.from({ length: 50 }, () => ({
      x: Math.random() * w(),
      y: Math.random() * h(),
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.1,
    }))

    const animate = () => {
      ctx.clearRect(0, 0, w(), h())
      particles.current.forEach((p) => {
        p.x += p.speedX; p.y += p.speedY
        if (p.x < 0) p.x = w(); if (p.x > w()) p.x = 0
        if (p.y < 0) p.y = h(); if (p.y > h()) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.opacity})`; ctx.fill()
      })
      for (let i = 0; i < particles.current.length; i++) {
        for (let j = i + 1; j < particles.current.length; j++) {
          const a = particles.current[i], b = particles.current[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(255,255,255,${0.06 * (1 - dist / 120)})`
            ctx.lineWidth = 0.5; ctx.stroke()
          }
        }
      }
      raf.current = requestAnimationFrame(animate)
    }
    animate()
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />
      <style>{`
        @keyframes float1{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-20px) rotate(5deg)}}
        @keyframes float2{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-15px) rotate(-3deg)}}
        @keyframes float3{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-25px) scale(1.05)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){*[class*=animate-]{animation:none!important}}
      `}</style>
    </>
  )
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
  const [hoveredField, setHoveredField] = useState<string | null>(null)
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

  const handleSubmit = async (e: FormEvent) => {
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
  const darkText = isDarkColor(loginBg) ? 'rgba(255,255,255,0.85)' : '#1e293b'
  const mutedText = isDarkColor(loginBg) ? 'rgba(255,255,255,0.5)' : '#64748b'

  return (
    <div
      className="min-h-dvh relative overflow-hidden flex"
      style={{ background: `linear-gradient(135deg, ${lighten(appBg, 0.08)} 0%, ${appBg} 50%, ${lighten(appBg, 0.04)} 100%)` }}
    >
      <AnimatedBackground primary={primary} secondary={secondary} loginBg={loginBg} />

      {/* Left Panel - Branding */}
      <div
        className="hidden lg:flex lg:w-[55%] xl:w-[60%] relative flex-col justify-between p-12 xl:p-16 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${loginBg} 0%, ${darken(loginBg, 0.15)} 100%)` }}
      >
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-20 blur-3xl animate-[float3_8s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(circle, ${primary}50, transparent 70%)` }} />
          <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-15 blur-3xl animate-[float2_10s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(circle, ${secondary}40, transparent 70%)` }} />
          <div className="absolute top-[30%] right-[10%] w-[200px] h-[200px] rounded-full opacity-10 blur-2xl animate-[float1_6s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(circle, ${primary}30, transparent 70%)` }} />
        </div>
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg animate-[scaleIn_0.6s_ease-out]">
              <img src={logo} alt="Logo" className="w-9 h-9 object-contain" width={36} height={36} />
            </div>
            <div>
              <p className="font-black text-xl tracking-tight" style={{ color: darkText }}>{appName}</p>
              <p className="text-xs font-mono tracking-[0.2em]" style={{ color: mutedText }}>{schoolName}</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 animate-[slideUp_0.8s_ease-out_0.2s_both]"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Sparkles className="w-4 h-4" style={{ color: 'white' } as React.CSSProperties} />
            <span className="text-xs font-mono tracking-[0.15em]" style={{ color: mutedText }}>PENILAIAN • KEJUJURAN • KETEPATAN</span>
          </div>

          <h1 className="text-6xl xl:text-8xl font-black leading-[0.88] tracking-tight mb-8 animate-[slideUp_0.8s_ease-out_0.4s_both]"
            style={{ color: darkText }}>
            Ujian<br />
            <span style={{ color: 'white' }}>Terukur.</span>
          </h1>

          <p className="text-base leading-relaxed max-w-md mb-12 animate-[slideUp_0.8s_ease-out_0.6s_both]"
            style={{ color: mutedText }}>
            Sistem ujian digital yang aman, cepat, dan terpercaya. Waktu dari server, jawaban autosave tiap detik, pengawasan presisi.
          </p>

          <div className="flex gap-6 animate-[slideUp_0.8s_ease-out_0.8s_both]">
            {[
              { icon: ShieldCheck, text: 'Aman & Terenkripsi' },
              { icon: Clock, text: 'Timer Server Akurat' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <Icon className="w-4 h-4" style={{ color: 'white' }} />
                <span className="text-sm font-medium" style={{ color: darkText }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-xs font-mono animate-[slideUp_0.8s_ease-out_1s_both]" style={{ color: mutedText }}>
          <span>© {new Date().getFullYear()} {schoolName}</span>
          <span className="w-12 h-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
          <span>Profesional • Aman • Terpercaya</span>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 relative flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="lg:hidden absolute inset-0 overflow-hidden">
          <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[80%] rounded-full opacity-20 blur-3xl animate-[float3_12s_ease-in-out_infinite]"
            style={{ background: `linear-gradient(135deg, ${primary}20, ${secondary}15, transparent)` }} />
        </div>

        <div className={`w-full max-w-md relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-3xl blur-xl opacity-30 animate-pulse" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
              <div className="relative w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-2xl">
                <img src={logo} alt="Logo" className="w-12 h-12 object-contain" width={48} height={48} />
              </div>
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">{appName}</h1>
            <p className="text-slate-400 text-sm font-mono tracking-widest mt-1">{schoolName}</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
            {/* Top accent line */}
            <div className="h-1 w-full" style={{
              background: `linear-gradient(90deg, ${primary}, ${secondary}, ${primary})`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s linear infinite'
            }} />

            <div className="p-8 sm:p-10">
              <div className="mb-8">
                <p className="text-xs font-mono tracking-[0.25em] mb-2" style={{ color: primary }}>MASUK</p>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Selamat Datang</h2>
                <p className="mt-2 text-sm text-slate-400">Masukkan kredensial yang diberikan admin</p>
              </div>

              {setupUnavailable && (
                <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="text-sm font-semibold text-amber-700">Mode setup belum aktif</p>
                  <p className="text-xs text-amber-500 mt-1">{setupCheck.error}</p>
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 animate-[scaleIn_0.3s_ease-out]">
                  <p className="text-sm font-medium text-rose-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {/* Username Field */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                    <User className="w-4 h-4" style={{ color: primary }} />
                    Username
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-5 group-focus-within:opacity-10 transition-opacity duration-300 blur-sm" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
                    <div className="relative flex items-center">
                      <div className="absolute left-3 text-slate-300 group-focus-within:transition-colors duration-300" style={{ color: '#94a3b8' }}>
                        <User className="w-4 h-4" style={{ color: 'white' }} />
                      </div>
                      <input
                        ref={usernameRef}
                        type="text"
                        id="username"
                        autoComplete="username"
                        autoCapitalize="none"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onFocus={() => setHoveredField('username')}
                        onBlur={() => setHoveredField(null)}
                        placeholder="contoh: budi.siswa"
                        required
                        className="w-full pl-10 pr-8 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-300 outline-none transition-all duration-200 text-sm"
                        style={{
                          borderColor: hoveredField === 'username' ? primary : undefined,
                          boxShadow: hoveredField === 'username' ? `0 0 0 3px ${primary}15` : undefined,
                        }}
                      />
                      {hoveredField === 'username' && (
                        <div className="absolute right-3 w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: primary }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                    <Lock className="w-4 h-4" style={{ color: primary }} />
                    Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-5 group-focus-within:opacity-10 transition-opacity duration-300 blur-sm" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
                    <div className="relative flex items-center">
                      <div className="absolute left-3 text-slate-300 transition-colors duration-300">
                        <Lock className="w-4 h-4" style={{ color: 'white' }} />
                      </div>
                      <input
                        ref={passwordRef}
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setHoveredField('password')}
                        onBlur={() => setHoveredField(null)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-300 outline-none transition-all duration-200 text-sm"
                        style={{
                          borderColor: hoveredField === 'password' ? primary : undefined,
                          boxShadow: hoveredField === 'password' ? `0 0 0 3px ${primary}15` : undefined,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 text-slate-300 hover:transition-colors duration-200 p-1"
                        style={{ color: hoveredField === 'password' ? primary : '#94a3b8' }}
                        aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      >
                         {showPassword ? <EyeOff className="w-4 h-4" style={{ color: 'white' }} /> : <Eye className="w-4 h-4" style={{ color: 'white' }} />}
                      </button>
                      {hoveredField === 'password' && !showPassword && (
                        <div className="absolute right-9 w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: primary }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-base relative overflow-hidden group mt-8 text-white outline-none transition-all duration-200"
                  style={{
                    background: loading ? '#94a3b8' : `linear-gradient(135deg, ${primary}, ${secondary})`,
                    boxShadow: `0 4px 16px ${primary}30`,
                    minWidth: 0,
                  }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 24px ${primary}50` }}
                  onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 16px ${primary}30` }}
                >
                  <span className={`absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ${loading ? '' : ''}`} />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Memproses...</>
                    ) : (
                      <><LogIn className="w-4 h-4" /> Masuk</>
                    )}
                  </span>
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="flex items-center justify-center gap-3 text-xs text-slate-300 font-mono">
                  <span className="w-8 h-px bg-slate-200" />
                  <span>AKUN DIBUAT ADMIN</span>
                  <span className="w-8 h-px bg-slate-200" />
                </div>
              </div>
            </div>
          </div>

          {/* Help Cards */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { num: '01', title: 'Username', desc: 'Dari admin' },
              { num: '02', title: 'Password', desc: 'Min 8 karakter' },
              { num: '03', title: 'Lupa?', desc: 'Hubungi admin' },
            ].map((item, i) => (
              <div key={item.num}
                className="text-center p-3 rounded-xl bg-white border border-slate-100 hover:shadow-md transition-all duration-300 cursor-default"
                style={{ animation: `slideUp 0.6s ease-out ${0.3 + i * 0.1}s both` }}
              >
                <p className="text-xs font-mono font-bold" style={{ color: primary }}>{item.num}</p>
                <p className="text-xs font-semibold text-slate-700 mt-1">{item.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-slate-300 font-mono">
            © {new Date().getFullYear()} {schoolName} • Aman & Terpercaya
          </p>
        </div>
      </div>
    </div>
  )
}

function isDarkColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma < 128
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
