import { useRef, useState } from 'react'
import { Building2, UserPlus, ImagePlus, X, Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/Input'
import { AcademicYearPicker } from '@/components/ui/AcademicYearPicker'
import { PasswordInput } from '@/components/ui/FormControls'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { uploadMedia } from '@/services/storage.service'
import type { SchoolForm, AdminForm } from './setup-types'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-primary-800 via-[#0B1E24] to-[#0B1E24] dark:bg-[#070D14]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1.2px, transparent 0)', backgroundSize: '24px 24px' }} />
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-primary-300/10 blur-3xl" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col items-start justify-center px-4 py-10 sm:px-6">{children}</div>
    </div>
  )
}

export function StepHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-slate-700 dark:text-slate-200">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
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
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-700 dark:text-slate-200">
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

export function Stepper({ step }: { step: number }) {
  const items = ['Profil Sekolah', 'Akun Admin']
  return (
    <ol className="mb-5 flex items-center gap-2">
      {items.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              step > i ? 'bg-emerald-500 text-white' : step === i ? 'bg-white text-primary-800' : 'bg-white/15 text-white/55'
            }`}
          >
            {step > i ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className={`text-xs font-semibold ${step >= i ? 'text-white' : 'text-white/45'}`}>
            {label}
          </span>
          {i === 0 && <span className="mx-2 h-px w-10 bg-white/20 sm:w-16" />}
        </li>
      ))}
    </ol>
  )
}

export function StepSchool({
  school,
  setSchool,
  errors,
  onNext,
}: {
  school: SchoolForm
  setSchool: (s: SchoolForm) => void
  errors: Record<string, string>
  onNext: (logoUrl: string) => void
}) {
  const set = (patch: Partial<SchoolForm>) => setSchool({ ...school, ...patch })
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(school.logoUrl || null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const pickFile = (file: File | undefined) => {
    setUploadError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('File harus berupa gambar (PNG, JPG, atau WebP).')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('Ukuran logo maksimal 2MB.')
      return
    }
    if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    setLogoFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const clearLogo = () => {
    if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    setLogoFile(null)
    setPreview(null)
    set({ logoUrl: '' })
    setUploadError('')
  }

  const handleSubmit = async (skipUpload: boolean) => {
    if (logoFile && !skipUpload) {
      setUploading(true)
      try {
        const result = await uploadMedia(logoFile, 'logo')
        onNext(result.url)
      } catch {
        setUploadError('Logo belum bisa diunggah dari mode setup. Lanjutkan tanpa logo — pasang nanti di Pengaturan → Branding.')
      } finally {
        setUploading(false)
      }
      return
    }
    onNext(school.logoUrl)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit(false)
      }}
      noValidate
      className="card w-full space-y-5 p-5 animate-fade-in rounded-2xl shadow-2xl sm:p-8"
    >
      <StepHeader icon={<Building2 className="h-5 w-5" />} title="Profil Sekolah" subtitle="Identitas yang tampil di seluruh aplikasi" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input label="Nama Sekolah" placeholder="SMK AL-FATA" value={school.schoolName} onChange={(e) => set({ schoolName: e.target.value })} error={errors.schoolName} required autoFocus />
        </div>
        <Input label="Kota / Kabupaten" placeholder="cth: Bandung" value={school.city} onChange={(e) => set({ city: e.target.value })} />
        <AcademicYearPicker value={school.academicYear} onChange={(v) => set({ academicYear: v })} error={errors.academicYear} />
        <div className="sm:col-span-2">
          <Input label="Kepala Sekolah" placeholder="Nama kepala sekolah" value={school.headmaster} onChange={(e) => set({ headmaster: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Input label="Alamat Sekolah" placeholder="Alamat lengkap sekolah" value={school.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
      </div>

      <div>
        <span className="label-base">Logo Sekolah (opsional)</span>
        {preview ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <img src={preview} alt="Pratinjau logo" className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{logoFile ? logoFile.name : 'Logo tersimpan'}</p>
              <p className="text-[11px] text-slate-400">{logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB • siap diunggah` : 'Akan dipakai di seluruh aplikasi'}</p>
            </div>
            <button type="button" onClick={clearLogo} aria-label="Hapus logo" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-sm font-semibold text-slate-500 transition-colors hover:border-primary-400 hover:bg-primary-50/50 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:border-primary-500/50 dark:hover:text-primary-300"
          >
            <ImagePlus className="h-5 w-5" />
            <span>Pilih gambar logo</span>
            <span className="text-xs font-normal text-slate-400">PNG / JPG / WebP • maks 2MB</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Pilih gambar logo" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
        {uploadError && (
          <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">{uploadError}</p>
            <button type="button" onClick={() => void handleSubmit(true)} className="mt-1.5 text-xs font-bold text-amber-800 underline underline-offset-2 hover:text-amber-900 dark:text-amber-200">
              Lanjut tanpa logo
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Logo tampil di login, splash screen, dan rapor. Dapat diganti kapan saja di Pengaturan → Branding.</p>
      </div>

      <p className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-xs leading-relaxed text-primary-900 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-primary-200">
        Nama aplikasi, logo, dan warna dapat diubah kapan saja oleh admin melalui menu Pengaturan.
      </p>

      <WizardActions nextLabel={uploading ? 'Mengunggah logo…' : 'Lanjut: Akun Admin'} loading={uploading} />
    </form>
  )
}

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
      className="card w-full space-y-5 p-5 animate-fade-in rounded-2xl shadow-2xl sm:p-8"
    >
      <StepHeader icon={<UserPlus className="h-5 w-5" />} title="Akun Super Admin" subtitle="Satu akun induk untuk mengelola seluruh sistem" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nama Lengkap" placeholder="cth: Muhammad Rizki, S.Kom" value={admin.fullName} onChange={(e) => set({ fullName: e.target.value })} error={errors.fullName} required autoFocus />
        <Input
          label="Username"
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
          <PasswordInput label="Password" name="setup-password" autoComplete="new-password" value={admin.password} onChange={(e) => set({ password: e.target.value })} error={errors.password} required placeholder="min. 8 karakter" />
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
        <PasswordInput label="Konfirmasi Password" name="setup-password-confirm" autoComplete="new-password" value={admin.confirmPassword} onChange={(e) => set({ confirmPassword: e.target.value })} error={errors.confirmPassword} required />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-xs leading-relaxed text-primary-900 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-primary-200">
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
