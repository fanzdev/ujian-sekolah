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
      const normalized = { ...query.data, extra_colors: Array.isArray(query.data.extra_colors) ? query.data.extra_colors : [] } as SchoolSettings
      setForm(normalized)
    }
  }, [query.data])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (!form) return <div className="flex justify-center py-14"><Spinner /></div>

  const palette = [form.primary_color, form.secondary_color, ...(form.extra_colors ?? [])].filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
  const setPalette = (next: string[]) => {
    const [p, s, ...rest] = next
    setForm({ ...form, primary_color: p ?? '#2563eb', secondary_color: s ?? p ?? '#0ea5e9', extra_colors: rest })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload: Partial<SchoolSettings> = {
        app_name: form.app_name,
        school_name: form.school_name,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        extra_colors: form.extra_colors ?? [],
        logo_url: form.logo_url,
        address: form.address,
        city: form.city,
        headmaster: form.headmaster,
        academic_year: form.academic_year,
        semester: form.semester,
      }
      await updateSchoolSettings(payload)
      applyBranding({ ...form, extra_colors: form.extra_colors ?? [] })
      toast.success(palette.length > 1 ? `Branding gradasi ${palette.length} warna tersimpan & diterapkan.` : 'Branding tersimpan & diterapkan.')
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
      setForm((f) => ({ ...f!, logo_url: result.url }))
      toast.success('Logo terunggah. Klik Simpan untuk menerapkan.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah.')
    } finally {
      setLogoUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Identitas Sekolah" subtitle="Diterapkan pada seluruh aplikasi termasuk halaman login." />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nama Aplikasi" value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
          <Input label="Nama Sekolah" value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} />
          <Input label="Tahun Ajaran" placeholder="cth: 2026/2027" value={form.academic_year ?? ''} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
          <Input label="Semester" placeholder="Ganjil / Genap" value={form.semester ?? ''} onChange={(e) => setForm({ ...form, semester: e.target.value })} />
          <Input label="Kepala Sekolah" value={form.headmaster ?? ''} onChange={(e) => setForm({ ...form, headmaster: e.target.value })} />
          <Input label="Kota" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <Input label="Alamat" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label-base">Logo Sekolah</label>
            <div className="group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-4 transition-colors hover:border-primary-400 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-primary-500/50 dark:hover:bg-slate-800">
              <div className="relative">
                <img src={form.logo_url || `${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-20 w-20 rounded-xl border border-slate-200 bg-white object-contain shadow-sm dark:border-slate-700 dark:bg-slate-900" width={80} height={80} />
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white shadow-md ring-2 ring-white dark:ring-slate-900">
                  <span className="text-sm font-bold leading-none">{logoUploading ? '…' : '+'}</span>
                </span>
              </div>
              <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary-600 shadow-sm ring-1 ring-slate-200 hover:bg-primary-50 dark:bg-slate-900 dark:text-primary-300 dark:ring-slate-700">
                {logoUploading ? 'Mengunggah…' : '+ Pilih Logo'}
                <input type="file" accept="image/*" className="hidden" disabled={logoUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = '' }} />
              </label>
              <p className="text-[11px] text-slate-400">PNG/SVG, maks 2MB — tampil di login & header</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Palet Warna Tema {palette.length > 1 && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Gradasi {palette.length} warna</span>}</p>
                <Button size="xs" variant="outline" onClick={() => setPalette([...palette, '#6366f1'])}>+ Tambah Warna</Button>
              </div>
              {palette.length > 1 && (
                <div className="mb-3 h-8 w-full rounded-lg border border-slate-200 shadow-inner dark:border-slate-700" style={{ background: `linear-gradient(90deg, ${palette.join(', ')})` }} aria-hidden />
              )}
              <div className="space-y-2">
                {palette.map((c, idx) => (
                  <div key={`${c}-${idx}`} className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow" style={{ background: c }}>{idx + 1}</span>
                      <input type="color" aria-label={`Warna ${idx + 1}`} value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#2563eb'} onChange={(e) => { const next = [...palette]; next[idx] = e.target.value; setPalette(next) }} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
                      <input type="text" value={c} onChange={(e) => { const next = [...palette]; next[idx] = e.target.value; setPalette(next) }} className="w-full bg-transparent font-mono text-xs outline-none dark:text-slate-100" maxLength={7} placeholder="#000000" />
                    </div>
                    {palette.length > 1 && (
                      <button onClick={() => setPalette(palette.filter((_, i) => i !== idx))} aria-label={`Hapus warna ${idx + 1}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">×</button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Hapus/tambah bebas. Jika &gt;1 warna, tema otomatis menjadi <strong>gradasi</strong> (header, tombol utama, nav aktif) — preview gradasi di atas.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={save} loading={saving} icon={<Save className="h-4 w-4" />}>Simpan Branding</Button>
        </div>
      </CardBody>
    </Card>
  )
}

function _ColorFieldUnused() {
  return null
}
void _ColorFieldUnused

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
