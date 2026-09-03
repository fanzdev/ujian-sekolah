import { Building2, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/FormControls'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { SchoolForm, AdminForm } from './setup-types'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-slate-900 pb-6">
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.02] blur-3xl" />
      <div className="relative flex items-start justify-center px-4 py-6 sm:px-8 sm:py-10">{children}</div>
    </div>
  )
}

export function StepHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-600 dark:text-white dark:text-white">
        {icon}
      </span>
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
      </div>
    </div>
  )
}

export function WizardActions({
  backLabel,
  nextLabel,
  onBack,
  loading,
}: {
  backLabel?: string
  nextLabel: string
  onBack?: () => void
  loading?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
      {backLabel && onBack ? (
        <Button variant="ghost" onClick={onBack} icon={<ArrowBack />}>
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" loading={loading} icon={<ArrowNext />} size="md">
        {nextLabel}
      </Button>
    </div>
  )
}

function ArrowBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  )
}

function ArrowNext() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  )
}

/* ---------------- STEP 1 : Profil sekolah ---------------- */

export function StepSchool({
  school,
  setSchool,
  errors,
  onNext,
}: {
  school: SchoolForm
  setSchool: (s: SchoolForm) => void
  errors: Record<string, string>
  onNext: () => void
}) {
  const set = (patch: Partial<SchoolForm>) => setSchool({ ...school, ...patch })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onNext()
      }}
      noValidate
      className="card space-y-5 p-5 sm:p-8 animate-fade-in rounded-[24px] sm:rounded-xl shadow-xl"
    >
      <StepHeader icon={<Building2 className="h-5 w-5" />} title="Profil Sekolah & Aplikasi" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nama Aplikasi *" placeholder="SMK AL-FATA CBT" value={school.appName} onChange={(e) => set({ appName: e.target.value })} error={errors.appName} required autoFocus />
        <Input label="Nama Sekolah *" placeholder="SMK AL-FATA" value={school.schoolName} onChange={(e) => set({ schoolName: e.target.value })} error={errors.schoolName} required />
        <Input label="Kota / Kabupaten" placeholder="cth: Bandung" value={school.city} onChange={(e) => set({ city: e.target.value })} />
        <Input label="Tahun Ajaran" placeholder="2026/2027" value={school.academicYear} onChange={(e) => set({ academicYear: e.target.value })} error={errors.academicYear} />
        <Input label="Kepala Sekolah" placeholder="Nama kepala sekolah" value={school.headmaster} onChange={(e) => set({ headmaster: e.target.value })} />
      </div>

      <Input label="Alamat Sekolah" placeholder="Alamat lengkap sekolah" value={school.address} onChange={(e) => set({ address: e.target.value })} />

      <div>
        <Input
          label="Logo (URL gambar — opsional)"
          placeholder="https://contoh.com/logo.png"
          value={school.logoUrl}
          onChange={(e) => set({ logoUrl: e.target.value })}
          error={errors.logoUrl}
          hint={
            <>
              Tempel URL logo berformat http(s). Upload file tersedia setelah login di{' '}
              <strong>Pengaturan → Branding</strong>.
            </>
          }
        />
        {school.logoUrl && !errors.logoUrl && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:bg-slate-800 dark:text-slate-200">
            <img src={school.logoUrl} alt="Pratinjau logo" className="h-12 w-12 rounded-lg object-contain" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
            <Badge tone="blue">Pratinjau logo</Badge>
          </div>
        )}
      </div>

      <p className="rounded-lg bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800">
        Semua isian branding dapat diubah kapan saja oleh admin melalui menu Pengaturan.
      </p>

      <WizardActions nextLabel="Lanjut: Akun Admin" />
    </form>
  )
}

/* ---------------- STEP 2 : Akun admin ---------------- */

export function StepAdmin({
  admin,
  setAdmin,
  errors,
  passwordScore,
  submitting,
  onBack,
  onSubmit,
}: {
  admin: AdminForm
  setAdmin: (a: AdminForm) => void
  errors: Record<string, string>
  passwordScore: { score: number; label: string; tone: 'red' | 'amber' | 'green' }
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const set = (patch: Partial<AdminForm>) => setAdmin({ ...admin, ...patch })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      noValidate
      className="card space-y-5 p-5 sm:p-8 animate-fade-in rounded-[24px] sm:rounded-xl shadow-xl"
    >
      <StepHeader icon={<UserPlus className="h-5 w-5" />} title="Akun Super Admin" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nama Lengkap *" placeholder="cth: Muhammad Rizki, S.Kom" value={admin.fullName} onChange={(e) => set({ fullName: e.target.value })} error={errors.fullName} required autoFocus />
        <Input
          label="Username *"
          placeholder="cth: admin"
          autoCapitalize="none"
          autoComplete="off"
          value={admin.username}
          onChange={(e) => set({ username: e.target.value.replace(/\s/g, '').toLowerCase() })}
          error={errors.username}
          required
          hint="Dipakai untuk login. Huruf kecil."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <PasswordInput label="Password *" name="setup-password" autoComplete="new-password" value={admin.password} onChange={(e) => set({ password: e.target.value })} error={errors.password} required placeholder="min. 8 karakter" />
          {admin.password.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 dark:text-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    passwordScore.tone === 'red' ? 'w-1/3 bg-rose-400' : passwordScore.tone === 'amber' ? 'w-2/3 bg-amber-400' : 'w-full bg-emerald-500'
                  }`}
                />
              </div>
              <Badge tone={passwordScore.tone}>{passwordScore.label}</Badge>
            </div>
          )}
        </div>
        <PasswordInput label="Konfirmasi Password *" name="setup-password-confirm" autoComplete="new-password" value={admin.confirmPassword} onChange={(e) => set({ confirmPassword: e.target.value })} error={errors.confirmPassword} required />
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
        <ShieldIcon /> Simpan username &amp; password ini dengan aman. Setelah setup selesai,
        wizard ini <strong>terkunci permanen</strong> — halaman login akan tampil seperti biasa.
      </p>

      <WizardActions backLabel="Kembali" onBack={onBack} nextLabel="Selesaikan Setup" loading={submitting} />
    </form>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  )
}
