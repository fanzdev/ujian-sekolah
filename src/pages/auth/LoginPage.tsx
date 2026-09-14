import { useState, type FormEvent, useRef, useCallback } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, User } from 'lucide-react'
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
import { getDefaultLogo } from '@/lib/logo'

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
  const benchRef = useRef<HTMLDivElement>(null)
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 })
  const onMove = useCallback((e: React.MouseEvent) => {
    const r = benchRef.current?.getBoundingClientRect()
    if (!r) return
    setMouse({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
  }, [])
  const onLeave = useCallback(() => setMouse({ x: 0.5, y: 0.5 }), [])

  const { data: branding } = useAsync(() => fetchSchoolSettings().then((s) => {
    applyBranding(s)
    return s
  }), [])
  const setupCheck = useAsync(() => getSetupStatus(), [])
  const loginBg = ((branding as unknown as { login_color?: string } | null)?.login_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { login_color: string }).login_color) ? (branding as unknown as { login_color: string }).login_color : '#0B1E24') as string
  const appBg = ((branding as unknown as { app_bg_color?: string } | null)?.app_bg_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { app_bg_color: string }).app_bg_color) ? (branding as unknown as { app_bg_color: string }).app_bg_color : '#FDF9F3') as string
  const primary = ((branding as unknown as { primary_color?: string } | null)?.primary_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { primary_color: string }).primary_color) ? (branding as unknown as { primary_color: string }).primary_color : '#0D868F') as string
  const secondary = ((branding as unknown as { secondary_color?: string } | null)?.secondary_color && /^#[0-9a-fA-F]{6}$/.test((branding as unknown as { secondary_color: string }).secondary_color) ? (branding as unknown as { secondary_color: string }).secondary_color : '#C67C3B') as string

  if (!isEnvConfigured()) return <Navigate to="/env-required" replace />
  if (setupCheck.loading && !setupCheck.error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#FDF9F3] dark:bg-slate-950">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  const setupUnavailable = Boolean(setupCheck.error)
  if (!setupUnavailable && setupCheck.data === true && !profile) return <Navigate to="/setup" replace />
  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) { setError('Username dan password wajib diisi.'); return }
    setLoading(true)
    try {
      const signedIn = await signInWithUsername(username.trim(), password)
      await refresh()
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : ROLE_HOME[signedIn.role] ?? '/', { replace: true })
    } catch (err) { setError(friendlyError(err)) } finally { setLoading(false) }
  }

  return (
    <div className="min-h-dvh dark:bg-[#070D14] selection:bg-primary-500/20 relative overflow-hidden app-bg" style={{ background: `var(--c-app-gradient, ${appBg})` }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fragment+Mono&display=swap');`}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[700px] w-[900px] -translate-x-1/2 rounded-full blur-3xl" style={{ animation: 'pageOrb 18s ease-in-out infinite', background: `linear-gradient(135deg, ${primary}14, ${secondary}12, transparent)` }} />
        <div className="absolute -bottom-40 right-[-120px] h-[600px] w-[600px] rounded-full blur-3xl" style={{ animation: 'pageOrb 22s ease-in-out infinite reverse', background: `linear-gradient(135deg, ${primary}12, ${secondary}10, transparent)` }} />
        <div className="absolute inset-0 opacity-[0.035] dark:opacity-[0.04]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, rgb(var(--c-primary-900) / 1) 1px, transparent 0)`, backgroundSize: '24px 24px', animation: 'gridDrift 32s linear infinite' }} />
      </div>
      <div className="relative mx-auto flex min-h-dvh max-w-[1280px] flex-col lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:gap-0">
        <div
          ref={benchRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="relative hidden overflow-hidden shadow-[0_24px_60px_rgba(11,30,36,0.22)] will-change-transform lg:flex lg:flex-col lg:justify-between lg:rounded-[28px] lg:m-4 lg:mr-0 lg:min-h-[calc(100dvh-32px)] login-panel"
          style={{ background: `var(--c-login-gradient, ${loginBg})`, animation: 'floatCard 6s ease-in-out infinite' }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1.2px, transparent 0)`, backgroundSize: '22px 22px' }} />
          <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(13,134,143,0.14), transparent 55%, rgba(0,0,0,0.28))` }} />
          <div
            aria-hidden
            className="pointer-events-none absolute left-[-8%] top-[32%] select-none font-black leading-none tracking-[-0.06em] will-change-transform"
            style={{
              fontSize: 'clamp(120px, 16vw, 220px)',
              color: 'transparent',
              WebkitTextStroke: '1.2px rgba(255,255,255,0.10)',
              transform: `translate(${(mouse.x - 0.5) * -18}px, ${(mouse.y - 0.5) * -10}px)`,
              transition: 'transform 700ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            UJIAN
          </div>
          <div className="pointer-events-none absolute left-6 top-6 h-10 w-10 border-l-2 border-t-2 border-white/15" />
          <div className="pointer-events-none absolute bottom-6 right-6 h-10 w-10 border-b-2 border-r-2 border-white/10" />

          <div className="relative p-8 xl:p-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1.5 shadow-lg">
                <img src={getDefaultLogo()} alt={`Logo ${branding?.app_name ?? 'Veyra CBT'}`} className="h-7 w-7 object-contain" width={28} height={28} />
              </div>
              <div className="leading-none">
                <p className="text-[13px] font-extrabold tracking-tight text-white">{branding?.app_name ?? 'Veyra CBT'}</p>
                <p className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-white/55">{branding?.school_name ?? 'SMK AL-FATA'} — RUANG UJIAN</p>
              </div>
            </div>
          </div>

          <div className="relative px-8 pb-8 xl:px-10 xl:pb-10">
            <div className="max-w-[520px]">
              <p className="font-mono text-[10px] tracking-[0.18em] text-accent">PENILAIAN • KEJUJURAN • KETEPATAN</p>
              <h1 className="mt-3 text-[40px] xl:text-[46px] font-black leading-[0.88] tracking-[-0.04em] text-white">
                Ujian yang<br />
                <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">terukur.</span>
              </h1>
              <p className="mt-4 max-w-[42ch] text-[13.5px] leading-relaxed text-white/65">
                Waktu dari server, jawaban autosave tiap detik, dan pengawasan yang tidak mengganggu — seperti meja kerja bengkel: bersih, presisi, siap pakai.
              </p>

              <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur">
                <div className="flex items-center justify-between border-b border-white/10 px-2 pb-3">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-white/50">LEMBAR SOAL — PRATINJAU</span>
                  <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-bold text-white">TERKUNCI</span>
                </div>
                <div className="space-y-2.5 px-2 pt-3">
                  <div className="flex gap-3">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" />
                    <p className="text-sm leading-snug text-white/85">Pilihan ganda — 4 opsi, 1 jawaban. Acak soal & opsi per peserta.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                    <p className="text-sm leading-snug text-white/55">Essay dinilai langsung oleh guru. Skor final tetap keputusan guru.</p>
                  </div>
                  <div className="flex items-center gap-2 pt-1 font-mono text-[10px] tracking-wide text-white/45">
                    <span className="h-px flex-1 bg-white/10" />
                    autosave 1s • anti-pindah tab • timer server
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 font-mono text-[10px] tracking-[0.12em] text-white/45">
                <span>© {new Date().getFullYear()} {branding?.school_name ?? 'SMK AL-FATA'}</span>
                <span className="h-3 w-px bg-white/15" />
                <span>Profesional • Aman • Terpercaya</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col dark:bg-[#070D14] lg:bg-transparent lg:dark:bg-transparent app-bg" style={{ background: `var(--c-app-gradient, ${appBg})` }}>
          <div className="relative flex flex-1 flex-col lg:items-center lg:justify-center lg:p-6 xl:p-8">
            <div className="relative overflow-hidden px-6 pb-8 pt-8 lg:hidden login-panel" style={{ background: `var(--c-login-gradient, ${loginBg})` }}>
              <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, white 1.2px, transparent 0)`, backgroundSize: '20px 20px' }} />
              <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              <div aria-hidden className="pointer-events-none absolute left-1/2 top-[52%] -translate-x-1/2 select-none font-black tracking-[-0.06em] text-white/[0.07]" style={{ fontSize: '92px', WebkitTextStroke: '1px rgba(255,255,255,0.12)', color: 'transparent' }}>UJIAN</div>
              <div className="relative flex flex-col items-center text-center text-white">
                <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[18px] bg-white shadow-xl">
                  <img src={getDefaultLogo()} alt={`Logo ${branding?.app_name ?? 'Veyra CBT'}`} className="h-10 w-10 object-contain" width={40} height={40} />
                </div>
                <h1 className="mt-3 text-lg font-extrabold tracking-tight">{branding?.app_name ?? 'Veyra CBT'}</h1>
                <p className="font-mono text-[10px] tracking-[0.14em] text-white/60">{branding?.school_name ?? 'SMK AL-FATA'} • CBT</p>
              </div>
            </div>

            <div className="flex flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 lg:w-full lg:max-w-[440px] lg:flex-none lg:px-0 lg:pb-0 lg:pt-0 will-change-transform" style={{ animation: 'floatCard 6.8s ease-in-out infinite reverse' }}>
              <div className="hidden lg:block">
                <p className="font-mono text-[10px] tracking-[0.16em] text-accent">MASUK — PESERTA & PENGAJAR</p>
                <h2 className="mt-2 text-[28px] font-black leading-none tracking-[-0.03em] text-primary-900 dark:text-white">Selamat datang.</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5A6B73] dark:text-slate-400">Pakai username dari admin. Waktu ujian ikut server, bukan jam perangkat.</p>
              </div>

              <div className="lg:hidden">
                <h2 className="flex items-center gap-2.5 text-[16px] font-black tracking-tight text-primary-900 dark:text-white">
                  <span className="h-1 w-7 rounded-full bg-accent" /> Masuk Akun
                </h2>
                <p className="mt-1 font-mono text-[11px] tracking-wide text-[#6B7A7F] dark:text-slate-400">Username & password dari admin/guru</p>
              </div>

              {setupUnavailable && (
                <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                  <p className="font-bold">Mode setup belum aktif.</p>
                  <p className="mt-1 opacity-80">{setupCheck.error}</p>
                </div>
              )}

              <div className="relative mt-6 overflow-hidden rounded-[22px] border border-black/10 bg-transparent p-6 shadow-none backdrop-blur-sm dark:border-white/10 dark:bg-transparent sm:p-7">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-90" style={{ background: 'var(--app-gradient, linear-gradient(90deg, rgb(var(--c-primary-600)), rgb(var(--c-accent-600))))' }} />
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-transparent opacity-0 blur-2xl" />
                <form onSubmit={handleSubmit} noValidate className="relative space-y-5">
                  {error && (
                    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/30 dark:bg-rose-500/10 dark:text-rose-300">
                      {error}
                    </div>
                  )}
                  <Input
                    label="Username"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    placeholder="budi.siswa"
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
                  <Button type="submit" loading={loading} size="lg" icon={<LogIn className="h-4 w-4" />} className="w-full rounded-xl bg-primary-900 text-white shadow-md hover:bg-primary-900/90 dark:bg-white dark:text-primary-900 dark:hover:bg-white/90">
                    Masuk
                  </Button>
                  <p className="flex items-center justify-center gap-1.5 pt-1 text-center font-mono text-[10px] tracking-[0.08em] text-[#8A9AA0] dark:text-slate-500">
                    <span className="h-px w-6 bg-primary-900/10 dark:bg-white/10" />
                    AKUN DIBUAT ADMIN
                    <span className="h-px w-6 bg-primary-900/10 dark:bg-white/10" />
                  </p>
                </form>
              </div>

              <div className="hidden lg:block">
                <div className="mt-4 rounded-2xl border border-black/5 bg-transparent p-4 shadow-none backdrop-blur-sm dark:border-white/10 dark:bg-transparent">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] tracking-[0.14em] text-[#8A9AA0] dark:text-slate-400">BANTUAN CEPAT</p>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl border border-black/5 bg-transparent px-3 py-3 dark:border-white/10 dark:bg-transparent">
                      <p className="font-mono text-[10px] tracking-wide text-accent">01</p>
                      <p className="mt-1 text-xs font-semibold leading-tight text-primary-900 dark:text-white">Username dari admin</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[#6B7A7F] dark:text-slate-400">Huruf kecil, tanpa spasi</p>
                    </div>
                    <div className="rounded-xl border border-black/5 bg-transparent px-3 py-3 dark:border-white/10 dark:bg-transparent">
                      <p className="font-mono text-[10px] tracking-wide text-accent">02</p>
                      <p className="mt-1 text-xs font-semibold leading-tight text-primary-900 dark:text-white">Password awal</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[#6B7A7F] dark:text-slate-400">Min. 8 karakter</p>
                    </div>
                    <div className="rounded-xl border border-black/5 bg-transparent px-3 py-3 dark:border-white/10 dark:bg-transparent">
                      <p className="font-mono text-[10px] tracking-wide text-accent">03</p>
                      <p className="mt-1 text-xs font-semibold leading-tight text-primary-900 dark:text-white">Lupa? Hubungi</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[#6B7A7F] dark:text-slate-400">Wali kelas / admin</p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-center font-mono text-[10px] tracking-[0.08em] text-[#8A9AA0] dark:text-slate-500">
                  © {new Date().getFullYear()} {branding?.school_name ?? 'SMK AL-FATA'} • Aman & Terpercaya
                </p>
              </div>

              <p className="mt-6 text-center font-mono text-[10px] tracking-[0.08em] text-[#8A9AA0] dark:text-slate-500 lg:hidden">
                © {new Date().getFullYear()} {branding?.school_name ?? 'SMK AL-FATA'} • Aman & Terpercaya
              </p>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes gridDrift{0%{background-position:0 0}100%{background-position:22px 22px}}@keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(12px, -8px) scale(1.02)}66%{transform:translate(-8px, 10px) scale(0.98)}}@keyframes floatCard{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}@keyframes pageOrb{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-14px, 10px) scale(1.03)}}@media (prefers-reduced-motion: reduce){[style*="gridDrift"],[style*="orbFloat"],[style*="floatCard"],[style*="pageOrb"]{animation:none!important}}`}</style>
    </div>
  )
}
