import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CheckCircle2, ShieldCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Feedback'
import { Shell, StepSchool, StepAdmin } from '@/components/setup/SetupSteps'
import { EMPTY_SCHOOL, EMPTY_ADMIN, scorePassword } from '@/components/setup/setup-types'
import type { SchoolForm, AdminForm } from '@/components/setup/setup-types'
import { getSetupStatus, runSetup } from '@/services/setup.service'
import { isEnvConfigured } from '@/services/client'
import { fetchSchoolSettings, applyBranding } from '@/services/settings.service'
import { friendlyError } from '@/lib/errors'
import { useAsync } from '@/hooks/useAsync'

export default function SetupWizardPage() {
  const navigate = useNavigate()
  const status = useAsync(() => getSetupStatus(), [])

  // Environment Supabase belum diisi → arahkan ke halaman peringatan env.
  if (!isEnvConfigured()) return <Navigate to="/env-required" replace />

  if (status.loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 dark:bg-slate-800 dark:text-slate-200">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status.error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldCheck className="h-12 w-12 text-primary-400" />
        <div>
          <h1 className="text-lg font-bold text-slate-800">Setup Awal Belum Dapat Dimuat</h1>
          <p className="mx-auto mt-2 max-w-md rounded-xl bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600 dark:bg-slate-700 dark:text-slate-200">
            {status.error}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Muat Ulang Halaman
        </Button>
      </div>
    )
  }

  // Sudah ada admin → wizard dikunci; jelaskan statusnya (jangan redirect diam-diam).
  if (!status.data) {
    return (
      <Shell>
        <div className="card w-full max-w-md p-8 text-center animate-fade-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-200">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">Wizard Terkunci</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Setup awal sudah pernah diselesaikan — akun admin sudah ada di sistem.
            Silakan masuk melalui halaman login menggunakan akun Anda.
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>
            Buka Halaman Login
          </Button>
        </div>
      </Shell>
    )
  }

  return <SetupWizard />
}

function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [school, setSchool] = useState<SchoolForm>(EMPTY_SCHOOL)
  const [admin, setAdmin] = useState<AdminForm>(EMPTY_ADMIN)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [doneUsername, setDoneUsername] = useState<string | null>(null)

  const passwordScore = useMemo(() => scorePassword(admin.password), [admin.password])

  const validateSchool = (): boolean => {
    const e: Record<string, string> = {}
    if (!school.appName.trim()) e.appName = 'Nama aplikasi wajib diisi.'
    if (!school.schoolName.trim()) e.schoolName = 'Nama sekolah wajib diisi.'
    if (school.logoUrl && !/^https?:\/\//i.test(school.logoUrl.trim())) {
      e.logoUrl = 'URL logo harus dimulai dengan http:// atau https://'
    }
    if (school.academicYear && !/^\d{4}\/\d{4}$/.test(school.academicYear.trim())) {
      e.academicYear = 'Format tahun ajaran: 2026/2027'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateAdmin = (): boolean => {
    const e: Record<string, string> = {}
    if (admin.fullName.trim().length < 2) e.fullName = 'Nama lengkap minimal 2 karakter.'
    if (!/^[a-z0-9._-]{3,30}$/.test(admin.username)) {
      e.username = '3–30 karakter: huruf kecil, angka, titik, garis bawah/strip.'
    }
    if (admin.password.length < 8) e.password = 'Password minimal 8 karakter.'
    if (admin.password !== admin.confirmPassword) e.confirmPassword = 'Konfirmasi password tidak sama.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validateAdmin()) return
    setSubmitting(true)
    try {
      await runSetup({
        username: admin.username.trim(),
        password: admin.password,
        fullName: admin.fullName.trim(),
        appName: school.appName.trim(),
        schoolName: school.schoolName.trim(),
        logoUrl: school.logoUrl.trim() || undefined,
        city: school.city.trim() || undefined,
        address: school.address.trim() || undefined,
        headmaster: school.headmaster.trim() || undefined,
        academicYear: school.academicYear.trim() || undefined,
      })
      try {
        applyBranding(await fetchSchoolSettings())
      } catch {
        /* branding refresh bersifat opsional */
      }
      setDoneUsername(admin.username.trim())
    } catch (err) {
      setErrors({ form: friendlyError(err) })
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------- Layar sukses ---------- */
  if (doneUsername !== null) {
    return (
      <Shell>
        <div className="card w-full max-w-md p-8 text-center animate-fade-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">Setup Selesai! 🎉</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Akun admin <strong className="font-mono text-slate-700">{doneUsername}</strong> dan profil sekolah
            berhasil dibuat. Wizard setup kini terkunci permanen.
          </p>
          <Button
            size="lg"
            className="mt-6 w-full"
            onClick={() => navigate('/login', { state: { prefillUsername: doneUsername } })}
          >
            Masuk ke Halaman Login
          </Button>
        </div>
      </Shell>
    )
  }

  /* ---------- Wizard ---------- */
  return (
    <Shell>
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center animate-fade-in">
          <img src={`${import.meta.env.BASE_URL}logo.webp`} alt="" width={64} height={64} className="mx-auto h-16 w-16 rounded-2xl shadow-lg" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">Setup Awal Sistem</h1>
          <p className="mt-1.5 text-sm text-primary-200">
            Belum ada akun admin. Lengkapi wizard ini <strong>sekali saja</strong> untuk mengaktifkan sistem ujian.
          </p>
        </div>

        <ol className="mb-5 flex items-center justify-center gap-2">
          {['Profil Sekolah', 'Akun Admin'].map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step >= i ? 'bg-white text-primary-700' : 'bg-white/20 text-white/60'
                }`}
              >
                {step > i ? '✓' : i + 1}
              </span>
              <span className={`hidden text-xs font-semibold sm:block ${step >= i ? 'text-white' : 'text-white/50'}`}>
                {label}
              </span>
              {i === 0 && <span className="mx-2 h-px w-10 bg-white/25 sm:w-16" />}
            </li>
          ))}
        </ol>

        {errors.form && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-300/50 bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-100 backdrop-blur animate-fade-in">
            {errors.form}
          </div>
        )}

        {step === 0 ? (
          <StepSchool school={school} setSchool={setSchool} errors={errors} onNext={() => validateSchool() && setStep(1)} />
        ) : (
          <StepAdmin
            admin={admin}
            setAdmin={setAdmin}
            errors={errors}
            passwordScore={passwordScore}
            submitting={submitting}
            onBack={() => setStep(0)}
            onSubmit={() => void submit()}
          />
        )}
      </div>
    </Shell>
  )
}
