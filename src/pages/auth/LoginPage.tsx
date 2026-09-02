import { useState, type FormEvent, useRef, useCallback } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, LockKeyhole, User } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/FormControls'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Feedback'
import { useAuth } from '@/hooks/useAuth'
import { signInWithUsername } from '@/services/auth.service'
import { getSetupStatus } from '@/services/setup.service'
import { isEnvConfigured } from '@/services/client'
import { fetchSchoolSettings, applyBranding } from '@/services/settings.service'
import { friendlyError } from '@/lib/errors'
import { ROLE_HOME } from '@/lib/constants'
import { useDocumentTitle, useAsync } from '@/hooks/useAsync'

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
  const leftRef = useRef<HTMLDivElement>(null)
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 })
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const r = leftRef.current?.getBoundingClientRect()
    if (!r) return
    setMouse({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
  }, [])
  const handleMouseLeave = useCallback(() => setMouse({ x: 0.5, y: 0.5 }), [])

  const { data: branding } = useAsync(() => fetchSchoolSettings().then((s) => {
    applyBranding(s)
    return s
  }), [])

  // Gerbang setup pertama: belum ada admin → tampilkan wizard, bukan login.
  const setupCheck = useAsync(() => getSetupStatus(), [])

  if (!isEnvConfigured()) return <Navigate to="/env-required" replace />
  if (setupCheck.loading && !setupCheck.error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  const setupUnavailable = Boolean(setupCheck.error)
  if (!setupUnavailable && setupCheck.data === true && !profile) {
    return <Navigate to="/setup" replace />
  }

  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi.')
      return
    }
    setLoading(true)
    try {
      const signedIn = await signInWithUsername(username.trim(), password)
      await refresh()
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : ROLE_HOME[signedIn.role] ?? '/', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 lg:grid lg:min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      <div
        ref={leftRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="group relative hidden overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12"
      >
        <div
          className="absolute -top-32 -right-32 h-[480px] w-[480px] rounded-full bg-white/[0.07] blur-3xl transition-transform duration-700 ease-out will-change-transform"
          style={{ transform: `translate(${(mouse.x - 0.5) * 40}px, ${(mouse.y - 0.5) * 40}px)` }}
        />
        <div
          className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl transition-transform duration-700 ease-out will-change-transform"
          style={{ transform: `translate(${(mouse.x - 0.5) * -30}px, ${(mouse.y - 0.5) * -30}px)` }}
        />
        <div className="absolute top-1/2 left-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06] transition-transform duration-700 ease-out" style={{ transform: `translate(-50%, -50%) scale(${1 + (mouse.x - 0.5) * 0.02})` }} />
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: `radial-gradient(600px circle at ${mouse.x * 100}% ${mouse.y * 100}%, rgba(255,255,255,0.08), transparent 40%)` }}
        />
        <div className="relative flex h-full flex-col justify-between text-white transition-transform duration-700 ease-out will-change-transform" style={{ transform: `translate(${(mouse.x - 0.5) * 12}px, ${(mouse.y - 0.5) * 12}px)` }}>
          <div className="flex items-center gap-3 transition-transform duration-700 ease-out" style={{ transform: `translate(${(mouse.x - 0.5) * -8}px, ${(mouse.y - 0.5) * -8}px)` }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-2 shadow-lg transition-transform duration-500 group-hover:scale-105 group-hover:shadow-xl">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-8 w-8 object-contain" width={32} height={32} />
            </div>
            <div>
              <p className="text-[15px] font-extrabold tracking-tight leading-none">{branding?.app_name ?? 'SMK AL-FATA CBT'}</p>
              <p className="text-xs font-medium text-white/60">{branding?.school_name ?? 'SMK AL-FATA'} • CBT</p>
            </div>
          </div>
          <div className="max-w-[440px]">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Sistem Aktif & Aman
            </div>
            <h2 className="mt-5 text-[32px] xl:text-[36px] leading-[1.1] font-black tracking-tight">
              Ujian yang<br />Adil & Andal.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-white/70">
              Platform ujian digital untuk 1000+ siswa — timer server, autosave, anti-curang, nilai real-time.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                <p className="text-lg font-extrabold">100%</p>
                <p className="text-[11px] leading-tight text-white/60">Sinkron Server</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                <p className="text-lg font-extrabold">0.5s</p>
                <p className="text-[11px] leading-tight text-white/60">Autosave</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                <p className="text-lg font-extrabold">24/7</p>
                <p className="text-[11px] leading-tight text-white/60">Siap Ujian</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-white/45">
            <p>© {new Date().getFullYear()} {branding?.school_name ?? 'SMK AL-FATA'}</p>
            <p className="hidden xl:block">v1.0 • Aman • Cepat • Profesional</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-dvh flex-col bg-slate-50 lg:min-h-0 lg:justify-center lg:bg-[#f8fafc] lg:p-8 xl:p-10">
        <div className="flex flex-1 flex-col lg:flex-none lg:justify-center">
          <div className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 px-6 pb-10 pt-8 lg:hidden">
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl animate-pulse" style={{ animationDuration: '3s' }} />
            <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-sky-400/15 blur-3xl animate-pulse" style={{ animationDuration: '4s', animationDelay: '0.5s' }} />
            <div className="relative flex flex-col items-center text-center text-white">
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-white shadow-xl">
                <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-11 w-11 object-contain" width={44} height={44} />
              </div>
              <h1 className="mt-4 text-xl font-extrabold tracking-tight">{branding?.app_name ?? 'SMK AL-FATA CBT'}</h1>
              <p className="mt-1 text-[13px] font-medium text-white/80">{branding?.school_name ?? 'SMK AL-FATA'} • CBT</p>
              <p className="mt-1 text-xs text-white/60">Masuk untuk mengakses dashboard</p>
            </div>
          </div>

          <div className="flex-1 bg-slate-50 px-4 pb-8 pt-6 lg:bg-white lg:p-0">
            <div className="mx-auto w-full max-w-sm animate-fade-in">
              <div className="hidden lg:block">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Selamat Datang Kembali</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">Masuk menggunakan username dan password yang diberikan admin.</p>
              </div>
              <div className="lg:hidden">
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-1 w-8 rounded-full bg-primary-600" />
                  <h2 className="text-[15px] font-bold tracking-tight text-slate-900">Masuk Akun</h2>
                </div>
                <p className="text-xs text-slate-500">Gunakan username & password dari admin/guru</p>
              </div>

              {setupUnavailable && (
                <div role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                  <p className="font-bold">Mode setup otomatis belum aktif.</p>
                  <p className="mt-1">{setupCheck.error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4 rounded-[24px] border border-slate-200/60 bg-white p-5 shadow-sm sm:p-6 lg:mt-6 lg:rounded-2xl lg:p-6 lg:shadow-sm">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 lg:hidden" aria-hidden />
                {error && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 animate-fade-in">
                    {error}
                  </div>
                )}
                <Input
                  label="Username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="cth: budi.siswa"
                  leftIcon={<User className="h-4 w-4" />}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <PasswordInput
                  label="Password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" loading={loading} size="lg" icon={<LogIn className="h-4 w-4" />} className="mt-2 w-full rounded-xl shadow-md">
                  Masuk Sekarang
                </Button>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-relaxed text-slate-500">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                  Akun dibuat admin • hubungi admin jika lupa password
                </div>
              </form>

              <p className="mt-6 text-center text-xs text-slate-400 lg:hidden">
                © {new Date().getFullYear()} {branding?.school_name ?? 'SMK AL-FATA'} • Aman & Terpercaya
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
