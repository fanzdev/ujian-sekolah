import { useEffect, useState } from 'react'
import { Settings, Palette, ShieldCheck, Save, Camera, Server } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ToggleSwitch } from '@/components/ui/FormControls'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import AiKeysPanel from '@/components/settings/AiKeysPanel'
import {
  fetchSchoolSettings,
  updateSchoolSettings,
  fetchSystemSettings,
  upsertSystemSetting,
  applyBranding,
} from '@/services/settings.service'
import type { SchoolSettings, SystemSettingsMap } from '@/types/models'

export default function SettingsPage() {
  const [tab, setTab] = useState('branding')
  useDocumentTitle('Pengaturan')

  return (
    <>
      <PageHeader title="Pengaturan Sistem" subtitle="Branding sekolah & konfigurasi ujian" icon={<Settings className="h-5 w-5" />} />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'branding', label: 'Branding' },
          { id: 'exam', label: 'Default Ujian' },
          { id: 'security', label: 'Keamanan' },
          { id: 'ai', label: 'AI Grading' },
        ]}
      />
      <div className="mt-6 w-full">
        {tab === 'branding' && <BrandingPanel />}
        {tab === 'exam' && <ExamDefaultsPanel />}
        {tab === 'security' && <SecurityPanel />}
        {tab === 'ai' && <AiKeysPanel />}
      </div>
    </>
  )
}

function BrandingPanel() {
  const toast = useToast()
  const query = useAsync(() => fetchSchoolSettings(), [])
  const [form, setForm] = useState<SchoolSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)

  useEffect(() => {
    if (query.data) {
      const normalized = {
        ...query.data,
        extra_colors: Array.isArray(query.data.extra_colors) ? query.data.extra_colors : [],
        primary_color: query.data.primary_color || '#0D868F',
      } as SchoolSettings
      setForm(normalized)
    }
  }, [query.data])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (!form) return <div className="flex justify-center py-14"><Spinner /></div>

  const save = async () => {
    if (!form.app_name?.trim() || !form.school_name?.trim()) {
      toast.error('Nama Aplikasi dan Nama Sekolah wajib diisi.')
      return
    }
    setSaving(true)
    try {
      const payload: Partial<SchoolSettings> = {
        app_name: form.app_name.trim(),
        school_name: form.school_name.trim(),
        primary_color: form.primary_color || '#0D868F',
        secondary_color: form.secondary_color || '#0CBCC9',
        extra_colors: form.extra_colors ?? [],
        logo_url: form.logo_url,
        favicon_url: form.favicon_url,
        address: form.address,
        city: form.city,
        headmaster: form.headmaster,
        academic_year: form.academic_year,
        semester: form.semester,
      }
      await updateSchoolSettings(payload)
      applyBranding({ ...form, primary_color: form.primary_color || '#0D868F', secondary_color: form.secondary_color || '#0D868F', extra_colors: form.extra_colors ?? [] })
      toast.success('Branding tersimpan & diterapkan.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (file: File) => {
    setLogoUploading(true)
    try {
      const { uploadMedia } = await import('@/services/storage.service')
      const result = await uploadMedia(file, 'logo')
      setForm((f) => ({ ...f!, logo_url: result.url, favicon_url: result.url }))
      toast.success('Logo terunggah. Klik Simpan untuk menerapkan.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah.')
    } finally {
      setLogoUploading(false)
    }
  }

  const useDefaultLogo = () => {
    setForm((f) => ({ ...f!, logo_url: `${import.meta.env.BASE_URL}logo.webp`, favicon_url: `${import.meta.env.BASE_URL}logo.webp` }))
    toast.success('Logo default (logo.webp) diterapkan. Klik Simpan untuk menyimpan.')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Identitas Sekolah" subtitle="Diterapkan pada seluruh aplikasi termasuk halaman login & splash screen." />
        <CardBody className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nama Aplikasi" value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} required placeholder="VCBT SMK AL-FATA" />
            <Input label="Nama Sekolah" value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} required placeholder="SMK AL-FATA" />
            <Input label="Tahun Ajaran" placeholder="cth: 2026/2027" value={form.academic_year ?? ''} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
            <Input label="Semester" placeholder="Ganjil / Genap" value={form.semester ?? ''} onChange={(e) => setForm({ ...form, semester: e.target.value })} />
            <Input label="Kepala Sekolah" value={form.headmaster ?? ''} onChange={(e) => setForm({ ...form, headmaster: e.target.value })} placeholder="Nama Kepala Sekolah" />
            <Input label="Kota" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Kota / Kabupaten" />
          </div>
          <Input label="Alamat" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Alamat lengkap sekolah" />

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-200">Warna Tema</p>
            <div className="h-8 w-full rounded-lg border border-slate-200 shadow-inner dark:border-slate-700" style={{ background: `linear-gradient(90deg, ${form.primary_color || '#0D868F'}, ${form.secondary_color || '#0CBCC9'})` }} aria-hidden />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <input type="color" aria-label="Warna Utama" value={/^#[0-9a-fA-F]{6}$/.test(form.primary_color || '') ? form.primary_color! : '#0D868F'} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-500">Warna Utama</p>
                  <input type="text" value={form.primary_color || '#0D868F'} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="w-full bg-transparent font-mono text-xs outline-none dark:text-slate-100" maxLength={7} placeholder="#000000" />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <input type="color" aria-label="Warna Sekunder" value={/^#[0-9a-fA-F]{6}$/.test(form.secondary_color || '') ? form.secondary_color! : '#0CBCC9'} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-500">Warna Sekunder</p>
                  <input type="text" value={form.secondary_color || '#0CBCC9'} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="w-full bg-transparent font-mono text-xs outline-none dark:text-slate-100" maxLength={7} placeholder="#000000" />
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Gradasi warna diterapkan pada header, tombol utama, splash screen, dan profil.</p>
          </div>

          <div className="space-y-3">
            <label className="label-base">Logo Aplikasi</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <img src={form.logo_url || `${import.meta.env.BASE_URL}logo.webp`} alt="Logo" className="h-20 w-20 rounded-xl border border-slate-200 bg-white object-contain p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900" width={80} height={80} />
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
                  <span className="text-xs font-bold leading-none">{logoUploading ? '…' : '+'}</span>
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700">
                  {logoUploading ? 'Mengunggah…' : 'Upload Logo'}
                  <input type="file" accept="image/*" className="hidden" disabled={logoUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = '' }} />
                </label>
                <button type="button" onClick={useDefaultLogo} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                  Pakai Logo Default
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Rekomendasi: PNG/WebP 512×512, kotak, maks 1MB.</p>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button onClick={save} loading={saving} icon={<Save className="h-4 w-4" />}>Simpan Branding</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}


function ExamDefaultsPanel() {
  const toast = useToast()
  const query = useAsync(() => Promise.all([fetchSystemSettings(), listExamsLite()]), [])
  const [defaults, setDefaults] = useState<SystemSettingsMap['exam_defaults'] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (query.data?.[0]?.exam_defaults) setDefaults(query.data[0].exam_defaults)
  }, [query.data])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (!defaults) return <div className="flex justify-center py-14"><Spinner /></div>

  const save = async () => {
    setSaving(true)
    try {
      await upsertSystemSetting('exam_defaults', defaults as unknown as Record<string, unknown>)
      toast.success('Default ujian tersimpan.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  void query.data?.[1]

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary-600" /> Nilai Bawaan Ujian Baru</span>} subtitle="Digunakan sebagai nilai awal saat guru membuat ujian." />
      <CardBody className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Durasi Default (menit)" type="number" min={5} value={defaults.duration_minutes} onChange={(e) => setDefaults({ ...defaults, duration_minutes: Number(e.target.value) })} />
          <Input label="Maksimal Percobaan" type="number" min={1} max={10} value={defaults.max_attempts} onChange={(e) => setDefaults({ ...defaults, max_attempts: Number(e.target.value) })} />
          <Input label="Batas Pelanggaran" type="number" min={1} max={20} value={defaults.violation_limit} onChange={(e) => setDefaults({ ...defaults, violation_limit: Number(e.target.value) })} hint="Sebelum auto-submit aktif." />
          <Input label="Passing Grade Default" type="number" min={0} value={defaults.passing_grade} onChange={(e) => setDefaults({ ...defaults, passing_grade: Number(e.target.value) })} />
        </div>
        <ToggleSwitch checked={defaults.shuffle_questions} onChange={(v) => setDefaults({ ...defaults, shuffle_questions: v })} label="Randomisasi soal default" />
        <ToggleSwitch checked={defaults.shuffle_options} onChange={(v) => setDefaults({ ...defaults, shuffle_options: v })} label="Randomisasi opsi jawaban default" />
        <ToggleSwitch checked={defaults.show_result_to_student} onChange={(v) => setDefaults({ ...defaults, show_result_to_student: v })} label="Siswa melihat nilai secara default" />
        <ToggleSwitch checked={defaults.auto_submit_on_limit} onChange={(v) => setDefaults({ ...defaults, auto_submit_on_limit: v })} label="Auto-submit saat pelanggaran melewati batas" />
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>Simpan Default</Button>
        </div>
      </CardBody>
    </Card>
  )
}

async function listExamsLite() {
  const { supabase } = await import('@/services/client')
  const { count } = await supabase.from('exams').select('id', { count: 'exact', head: true })
  return count ?? 0
}

function SecurityPanel() {
  const toast = useToast()
  const query = useAsync(() => fetchSystemSettings(), [])
  const [security, setSecurity] = useState<SystemSettingsMap['security'] | null>(null)
  const [passwordPolicy, setPasswordPolicy] = useState<SystemSettingsMap['password_policy'] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (query.data?.security) setSecurity(query.data.security)
    if (query.data?.password_policy) setPasswordPolicy(query.data.password_policy)
  }, [query.data])

  if (!security || !passwordPolicy) return <div className="flex justify-center py-14"><Spinner /></div>

  const saveAll = async () => {
    setSaving(true)
    try {
      await upsertSystemSetting('security', security as unknown as Record<string, unknown>)
      await upsertSystemSetting('password_policy', passwordPolicy as unknown as Record<string, unknown>)
      toast.success('Pengaturan keamanan tersimpan.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Camera className="h-4 w-4 text-primary-600" /> Monitoring</span>} />
        <CardBody className="space-y-4">
          <ToggleSwitch
            checked={security.camera_snapshots_enabled}
            onChange={(v) => setSecurity({ ...security, camera_snapshots_enabled: v })}
            label="Simpan snapshot kamera berkala"
            description="Jika aktif, thumbnail kamera siswa diunggah ke Storage selama ujian berlangsung. Perhatikan kebijakan privasi."
          />
          <ToggleSwitch checked={security.ip_logging} onChange={(v) => setSecurity({ ...security, ip_logging: v })} label="Catat metadata perangkat" description="User-agent dan info browser dicatat pada attempt & pelanggaran." />
          <ToggleSwitch checked={security.device_logging} onChange={(v) => setSecurity({ ...security, device_logging: v })} label="Catat aktivitas device tambahan" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Kebijakan Password</span>} subtitle="Berlaku untuk pembuatan akun baru." />
        <CardBody>
          <Input label="Panjang Minimal Password" type="number" min={6} max={64} value={passwordPolicy.min_length} onChange={(e) => setPasswordPolicy({ min_length: Number(e.target.value) })} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <Server className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            Durasi sesi login (JWT expiry) dikelola langsung di Supabase Dashboard → Authentication → Settings.
          </p>
          <Button onClick={saveAll} loading={saving}>Simpan Pengaturan Keamanan</Button>
        </CardBody>
      </Card>
    </div>
  )
}
