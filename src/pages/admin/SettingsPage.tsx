import { useEffect, useState } from 'react'
import { Settings, Palette, ShieldCheck, Save, Camera, Server, Trash2, AlertTriangle, Skull, Plus, X } from 'lucide-react'
import { useConfirm } from '@/hooks/useConfirm'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AcademicYearPicker } from '@/components/ui/AcademicYearPicker'
import { SemesterPicker } from '@/components/ui/SemesterPicker'
import { ToggleSwitch } from '@/components/ui/FormControls'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import {
  fetchSchoolSettings,
  updateSchoolSettings,
  fetchSystemSettings,
  upsertSystemSetting,
  applyBranding,
} from '@/services/settings.service'
import type { SchoolSettings, SystemSettingsMap } from '@/types/models'
import { getDefaultLogo, resolveLogoUrl, sanitizeLogoUrl } from '@/lib/logo'
import { THEME_PRESETS, isContrastOk, suggestSecondary, type ThemePreset } from '@/lib/themePresets'

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
          { id: 'danger', label: 'Bahaya' },
        ]}
      />
      <div className="mt-6 w-full">
        {tab === 'branding' && <BrandingPanel />}
        {tab === 'exam' && <ExamDefaultsPanel />}
        {tab === 'security' && <SecurityPanel />}
        {tab === 'danger' && <DangerPanel />}
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
  const [showCustom, setShowCustom] = useState(true)

  useEffect(() => {
    if (query.data) {
      const sanitizeGrad = (raw: unknown): Record<string, string[]> => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
        const out: Record<string, string[]> = {}
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (Array.isArray(v)) out[k] = (v as unknown[]).filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 8)
        }
        return out
      }
      const normalized = {
        ...query.data,
        extra_colors: Array.isArray(query.data.extra_colors) ? (query.data.extra_colors as string[]).filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 12) : [],
        primary_color: query.data.primary_color || '#0D868F',
        secondary_color: query.data.secondary_color || '#2DD4BF',
        theme_preset: (query.data as unknown as { theme_preset?: string | null }).theme_preset ?? 'bengkel-presisi',
        login_color: (query.data as unknown as { login_color?: string | null }).login_color || '#0B1E24',
        sidebar_color: (query.data as unknown as { sidebar_color?: string | null }).sidebar_color || '#0D868F',
        app_bg_color: (query.data as unknown as { app_bg_color?: string | null }).app_bg_color || '#EDEDED',
        splash_bg_color: (query.data as unknown as { splash_bg_color?: string | null }).splash_bg_color || '#064247',
        card_gradients: sanitizeGrad((query.data as unknown as { card_gradients?: unknown }).card_gradients),
      } as unknown as SchoolSettings
      setForm(normalized)
      setShowCustom(true)
    }
  }, [query.data])

  useEffect(() => {
    if (!form) return
    const curPreset = THEME_PRESETS.find((p) => p.id === (form as unknown as { theme_preset?: string | null }).theme_preset) ?? null
    const effPrimary = curPreset ? curPreset.primary : form.primary_color || '#0D868F'
    const effSecondary = curPreset ? curPreset.secondary : form.secondary_color || '#2DD4BF'
    const effLogin = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { login_color?: string }).login_color ?? '') ? (form as unknown as { login_color: string }).login_color : '#0B1E24'
    const effSidebar = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { sidebar_color?: string }).sidebar_color ?? '') ? (form as unknown as { sidebar_color: string }).sidebar_color : '#0D868F'
    const effAppBg = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { app_bg_color?: string }).app_bg_color ?? '') ? (form as unknown as { app_bg_color: string }).app_bg_color : '#EDEDED'
    const effSplash = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { splash_bg_color?: string }).splash_bg_color ?? '') ? (form as unknown as { splash_bg_color: string }).splash_bg_color : '#064247'
    const effExtras = Array.isArray(form.extra_colors) ? (form.extra_colors as string[]).filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 12) : []
    const effGrads = ((form as unknown as { card_gradients?: Record<string, string[]> }).card_gradients ?? {}) as Record<string, string[]>
    const id = window.setTimeout(() => {
      try {
        applyBranding({
          ...form,
          primary_color: effPrimary,
          secondary_color: effSecondary,
          login_color: effLogin,
          sidebar_color: effSidebar,
          app_bg_color: effAppBg,
          splash_bg_color: effSplash,
          extra_colors: effExtras,
          card_gradients: effGrads,
          theme_preset: (form as unknown as { theme_preset?: string | null }).theme_preset ?? 'bengkel-presisi',
        } as unknown as SchoolSettings)
      } catch { void 0 }
    }, 70)
    return () => window.clearTimeout(id)
  }, [form])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (!form) return <div className="flex justify-center py-14"><Spinner /></div>

  const currentPreset = THEME_PRESETS.find((p) => p.id === (form as unknown as { theme_preset?: string | null }).theme_preset) ?? null
  const effectivePrimary = currentPreset ? currentPreset.primary : form.primary_color || '#0D868F'
  const effectiveSecondary = currentPreset ? currentPreset.secondary : form.secondary_color || '#2DD4BF'
  const effectiveLogin = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { login_color?: string }).login_color ?? '') ? (form as unknown as { login_color: string }).login_color : '#0B1E24'
  const effectiveSidebar = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { sidebar_color?: string }).sidebar_color ?? '') ? (form as unknown as { sidebar_color: string }).sidebar_color : '#0D868F'
  const effectiveAppBg = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { app_bg_color?: string }).app_bg_color ?? '') ? (form as unknown as { app_bg_color: string }).app_bg_color : '#EDEDED'
  const effectiveSplash = /^#[0-9a-fA-F]{6}$/.test((form as unknown as { splash_bg_color?: string }).splash_bg_color ?? '') ? (form as unknown as { splash_bg_color: string }).splash_bg_color : '#064247'
  const effectiveExtras = Array.isArray(form.extra_colors) ? (form.extra_colors as string[]).filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 12) : []
  const effectivePalette = [effectivePrimary, effectiveSecondary, ...effectiveExtras].filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
  const cardGrads = ((form as unknown as { card_gradients?: Record<string, string[]> }).card_gradients ?? {}) as Record<string, string[]>
  const getGrad = (key: string): string[] => Array.isArray(cardGrads[key]) ? cardGrads[key].filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 8) : []
  const buildPreview = (base: string, key: string): string => {
    const arr = getGrad(key)
    const stops = [base, ...arr].filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
    return stops.length > 1 ? `linear-gradient(135deg, ${stops.join(', ')})` : base
  }
  const addGrad = (key: string, color = '#0D868F') => {
    const cur = getGrad(key)
    if (cur.length >= 8) return
    const next = { ...cardGrads, [key]: [...cur, color] }
    setForm({ ...form, card_gradients: next } as unknown as SchoolSettings)
  }
  const updateGrad = (key: string, idx: number, color: string) => {
    const cur = getGrad(key)
    const nextArr = [...cur]
    nextArr[idx] = color
    const next = { ...cardGrads, [key]: nextArr }
    setForm({ ...form, card_gradients: next } as unknown as SchoolSettings)
  }
  const removeGrad = (key: string, idx: number) => {
    const cur = getGrad(key)
    const nextArr = cur.filter((_, i) => i !== idx)
    const next = { ...cardGrads, [key]: nextArr }
    if (nextArr.length === 0) delete (next as Record<string, string[]>)[key]
    setForm({ ...form, card_gradients: next } as unknown as SchoolSettings)
  }
  const contrastOk = isContrastOk('#ffffff', effectivePrimary, 4.5)

  const selectPreset = (preset: ThemePreset) => {
    setForm((f) => ({ ...f!, primary_color: preset.primary, secondary_color: preset.secondary, theme_preset: preset.id } as SchoolSettings))
    setShowCustom(true)
  }

  const selectCustom = () => {
    setForm((f) => ({ ...f!, theme_preset: 'custom' } as unknown as SchoolSettings))
    setShowCustom(true)
  }

  const save = async () => {
    if (!form.app_name?.trim() || !form.school_name?.trim()) {
      toast.error('Nama Aplikasi dan Nama Sekolah wajib diisi.')
      return
    }
    const gradVals = Object.values(cardGrads).flat()
    const allHex = [effectivePrimary, effectiveSecondary, effectiveLogin, effectiveSidebar, effectiveAppBg, effectiveSplash, ...effectiveExtras, ...gradVals]
    if (allHex.some((c) => !/^#[0-9a-fA-F]{6}$/.test(c))) {
      toast.error('Format warna tidak valid. Gunakan hex 6 digit, contoh #0D868F.')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        app_name: form.app_name.trim(),
        school_name: form.school_name.trim(),
        primary_color: effectivePrimary,
        secondary_color: effectiveSecondary,
        extra_colors: effectiveExtras,
        theme_preset: (form as unknown as { theme_preset?: string | null }).theme_preset ?? 'bengkel-presisi',
        login_color: effectiveLogin,
        sidebar_color: effectiveSidebar,
        app_bg_color: effectiveAppBg,
        splash_bg_color: effectiveSplash,
        card_gradients: cardGrads,
        logo_url: form.logo_url,
        favicon_url: form.favicon_url,
        address: form.address,
        city: form.city,
        headmaster: form.headmaster,
        academic_year: form.academic_year,
        semester: form.semester,
      }
      await updateSchoolSettings(payload as Partial<SchoolSettings>)
      applyBranding({ ...form, primary_color: effectivePrimary, secondary_color: effectiveSecondary, login_color: effectiveLogin, sidebar_color: effectiveSidebar, app_bg_color: effectiveAppBg, splash_bg_color: effectiveSplash, extra_colors: effectiveExtras, card_gradients: cardGrads, theme_preset: payload.theme_preset as string } as unknown as SchoolSettings)
      toast.success('Branding tersimpan & diterapkan ke semua permukaan.')
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
    const fb = getDefaultLogo()
    setForm((f) => ({ ...f!, logo_url: fb, favicon_url: fb }))
    toast.success('Logo default (logo.webp) diterapkan. Klik Simpan untuk menyimpan.')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Identitas Sekolah" subtitle="Diterapkan pada seluruh aplikasi termasuk halaman login & splash screen." />
        <CardBody className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nama Aplikasi" value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} required placeholder="Veyra CBT" />
            <Input label="Nama Sekolah" value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} required placeholder="SMK AL-FATA" />
            <AcademicYearPicker value={form.academic_year ?? ''} onChange={(v) => setForm({ ...form, academic_year: v })} />
            <SemesterPicker value={form.semester ?? ''} onChange={(v) => setForm({ ...form, semester: v })} />
            <Input label="Kepala Sekolah" value={form.headmaster ?? ''} onChange={(e) => setForm({ ...form, headmaster: e.target.value })} placeholder="Nama Kepala Sekolah" />
            <Input label="Kota" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Kota / Kabupaten" />
          </div>
          <Input label="Alamat" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Alamat lengkap sekolah" />

          <div className="rounded-[20px] border border-black/5 p-5 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]" style={{ backgroundColor: 'color-mix(in srgb, var(--c-app-bg, #FFFFFF) 42%, white)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] tracking-[0.16em] text-accent">TEMA — PRESET TERKURASI</p>
                <p className="mt-1 text-sm font-bold tracking-tight text-primary-900 dark:text-white">Pilih nuansa yang paling Veyra</p>
                <p className="text-xs text-[#6B7A7F] dark:text-white/60">Preset sudah diuji kontras & harmoni — aman untuk elegansi.</p>
              </div>
              <span className="hidden rounded-full bg-primary-900 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wide text-white dark:bg-white dark:text-primary-900 sm:inline">4 PRESET</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {THEME_PRESETS.map((preset) => {
                const active = (form as unknown as { theme_preset?: string | null }).theme_preset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    className={`group relative overflow-hidden rounded-2xl border-2 p-3 text-left transition-all ${active ? 'border-primary-900 bg-white shadow-md dark:border-white dark:bg-white/[0.08]' : 'border-primary-900/8 bg-white hover:border-primary-900/15 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04]'}`}
                  >
                    <div className="h-14 w-full rounded-xl border border-black/5" style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }} aria-hidden />
                    <p className="mt-2.5 text-sm font-bold tracking-tight text-primary-900 dark:text-white">{preset.label}</p>
                    <p className="text-[11px] leading-snug text-[#6B7A7F] dark:text-white/60">{preset.description}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: preset.primary }} />
                      <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: preset.secondary }} />
                      <span className="ml-auto font-mono text-[10px] text-[#8A9AA0]">{preset.primary} • {preset.secondary}</span>
                    </div>
                    {active && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary-900 text-white dark:bg-white dark:text-primary-900">✓</span>}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={selectCustom} className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${showCustom ? 'bg-primary-900 text-white dark:bg-white dark:text-primary-900' : 'border border-black/5 bg-white text-primary-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:text-white'}`}>Kustom</button>
              <span className="font-mono text-[11px] text-[#8A9AA0]">Bebas — 6 warna + palet gradasi tak terbatas</span>
              {!contrastOk && <span className="rounded-full bg-rose-50 px-2.5 py-1 font-mono text-[11px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">Kontras rendah</span>}
            </div>
            {showCustom && (
              <div className="mt-4 space-y-4 rounded-2xl border border-primary-900/8 bg-white p-4 dark:border-white/10 dark:bg-primary-900/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">KUSTOM — 6 WARNA SEMANTIK</p>
                    <p className="mt-1 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/60">Setiap warna mengendalikan satu permukaan. Semua bagian aplikasi mengikuti pengaturan ini secara langsung — tidak ada warna hardcoded.</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Realtime</span>
                </div>
                <p className="rounded-lg bg-primary-50 px-3 py-2 text-[11px] leading-relaxed text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">Warna berubah <strong>realtime</strong> di seluruh aplikasi (sidebar, login, splash, background, header, tombol) saat Anda menggeser picker. Klik <strong>Simpan Branding</strong> untuk menyimpan permanen ke database — jika tidak disimpan, refresh akan kembali ke warna tersimpan.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-primary-900/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label="Warna Utama" value={/^#[0-9a-fA-F]{6}$/.test(form.primary_color || '') ? form.primary_color! : '#0D868F'} onChange={(e) => setForm({ ...form, primary_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Warna Utama</p>
                        <input type="text" value={form.primary_color || '#0D868F'} onChange={(e) => setForm({ ...form, primary_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="w-full bg-transparent font-mono text-xs font-bold text-primary-900 outline-none dark:text-white" maxLength={7} placeholder="#0D868F" />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/65">Tombol utama, link, progress, `primary-50…900`, awal gradasi. Wajib kontras ≥4.5:1.</p>
                    <div className="mt-2 rounded-lg border border-dashed border-primary-900/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Gradasi Utama — {getGrad('primary').length} tambahan</p>
                        <button type="button" onClick={() => addGrad('primary', suggestSecondary(effectivePrimary))} disabled={getGrad('primary').length >= 8} className="inline-flex items-center gap-1 rounded-full bg-primary-900 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-primary-900"><Plus className="h-3 w-3" /> Tambah</button>
                      </div>
                      {getGrad('primary').length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {getGrad('primary').map((c, i) => (
                            <div key={`p-${i}`} className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2 py-1 dark:border-white/10 dark:bg-primary-900">
                              <input type="color" value={c} onChange={(e) => updateGrad('primary', i, e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={c} onChange={(e) => updateGrad('primary', i, e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold text-primary-900 outline-none dark:text-white" maxLength={7} />
                              <button type="button" onClick={() => removeGrad('primary', i)} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <div className="h-6 w-full rounded-full border border-black/5" style={{ background: buildPreview(effectivePrimary, 'primary') }} />
                        </div>
                      )}
                      {getGrad('primary').length === 0 && <p className="mt-1.5 font-mono text-[10px] text-[#8A9AA0]">Kosong = solid. Tambah warna untuk gradient `primary → ...`</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary-900/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label="Warna Sekunder" value={/^#[0-9a-fA-F]{6}$/.test(form.secondary_color || '') ? form.secondary_color! : '#2DD4BF'} onChange={(e) => setForm({ ...form, secondary_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Warna Sekunder</p>
                        <input type="text" value={form.secondary_color || '#2DD4BF'} onChange={(e) => setForm({ ...form, secondary_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="w-full bg-transparent font-mono text-xs font-bold text-primary-900 outline-none dark:text-white" maxLength={7} placeholder="#2DD4BF" />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/65">Aksen gradasi, badge. Bersama utama → `--app-gradient` header &amp; tombol.</p>
                    <div className="mt-2 rounded-lg border border-dashed border-primary-900/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Gradasi Sekunder — {getGrad('secondary').length} tambahan</p>
                        <button type="button" onClick={() => addGrad('secondary')} disabled={getGrad('secondary').length >= 8} className="inline-flex items-center gap-1 rounded-full bg-primary-900 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-primary-900"><Plus className="h-3 w-3" /> Tambah</button>
                      </div>
                      {getGrad('secondary').length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {getGrad('secondary').map((c, i) => (
                            <div key={`s-${i}`} className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2 py-1 dark:border-white/10 dark:bg-primary-900">
                              <input type="color" value={c} onChange={(e) => updateGrad('secondary', i, e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={c} onChange={(e) => updateGrad('secondary', i, e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold text-primary-900 outline-none dark:text-white" maxLength={7} />
                              <button type="button" onClick={() => removeGrad('secondary', i)} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <div className="h-6 w-full rounded-full border border-black/5" style={{ background: buildPreview(effectiveSecondary, 'secondary') }} />
                        </div>
                      )}
                      {getGrad('secondary').length === 0 && <p className="mt-1.5 font-mono text-[10px] text-[#8A9AA0]">Kosong = solid.</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary-900/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label="Warna Login" value={/^#[0-9a-fA-F]{6}$/.test((form as unknown as { login_color?: string }).login_color ?? '') ? (form as unknown as { login_color: string }).login_color : '#0B1E24'} onChange={(e) => setForm({ ...form, login_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Warna Login — Panel Kiri</p>
                        <input type="text" value={(form as unknown as { login_color?: string }).login_color || '#0B1E24'} onChange={(e) => setForm({ ...form, login_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="w-full bg-transparent font-mono text-xs font-bold text-primary-900 outline-none dark:text-white" maxLength={7} placeholder="#0B1E24" />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/65">Latar panel kiri login &amp; header mobile. `--c-login-bg`.</p>
                    <div className="mt-2 rounded-lg border border-dashed border-primary-900/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Gradasi Login — {getGrad('login').length} tambahan</p>
                        <button type="button" onClick={() => addGrad('login')} disabled={getGrad('login').length >= 8} className="inline-flex items-center gap-1 rounded-full bg-primary-900 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-primary-900"><Plus className="h-3 w-3" /> Tambah</button>
                      </div>
                      {getGrad('login').length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {getGrad('login').map((c, i) => (
                            <div key={`l-${i}`} className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2 py-1 dark:border-white/10 dark:bg-primary-900">
                              <input type="color" value={c} onChange={(e) => updateGrad('login', i, e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={c} onChange={(e) => updateGrad('login', i, e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold text-primary-900 outline-none dark:text-white" maxLength={7} />
                              <button type="button" onClick={() => removeGrad('login', i)} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <div className="h-6 w-full rounded-full border border-black/5" style={{ background: buildPreview(effectiveLogin, 'login') }} />
                        </div>
                      )}
                      {getGrad('login').length === 0 && <p className="mt-1.5 font-mono text-[10px] text-[#8A9AA0]">Tambah warna untuk gradient login.</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary-900/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label="Warna Sidebar" value={/^#[0-9a-fA-F]{6}$/.test((form as unknown as { sidebar_color?: string }).sidebar_color ?? '') ? (form as unknown as { sidebar_color: string }).sidebar_color : '#0D868F'} onChange={(e) => setForm({ ...form, sidebar_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Warna Sidebar</p>
                        <input type="text" value={(form as unknown as { sidebar_color?: string }).sidebar_color || '#0D868F'} onChange={(e) => setForm({ ...form, sidebar_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="w-full bg-transparent font-mono text-xs font-bold text-primary-900 outline-none dark:text-white" maxLength={7} placeholder="#0D868F" />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/65">Sidebar `--c-sidebar-bg`. Teks putih di atasnya.</p>
                    <div className="mt-2 rounded-lg border border-dashed border-primary-900/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Gradasi Sidebar — {getGrad('sidebar').length} tambahan</p>
                        <button type="button" onClick={() => addGrad('sidebar')} disabled={getGrad('sidebar').length >= 8} className="inline-flex items-center gap-1 rounded-full bg-primary-900 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-primary-900"><Plus className="h-3 w-3" /> Tambah</button>
                      </div>
                      {getGrad('sidebar').length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {getGrad('sidebar').map((c, i) => (
                            <div key={`sb-${i}`} className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2 py-1 dark:border-white/10 dark:bg-primary-900">
                              <input type="color" value={c} onChange={(e) => updateGrad('sidebar', i, e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={c} onChange={(e) => updateGrad('sidebar', i, e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold text-primary-900 outline-none dark:text-white" maxLength={7} />
                              <button type="button" onClick={() => removeGrad('sidebar', i)} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <div className="h-6 w-full rounded-full border border-black/5" style={{ background: buildPreview(effectiveSidebar, 'sidebar') }} />
                        </div>
                      )}
                      {getGrad('sidebar').length === 0 && <p className="mt-1.5 font-mono text-[10px] text-[#8A9AA0]">Tambah untuk gradient sidebar.</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary-900/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label="Warna Latar Aplikasi" value={/^#[0-9a-fA-F]{6}$/.test((form as unknown as { app_bg_color?: string }).app_bg_color ?? '') ? (form as unknown as { app_bg_color: string }).app_bg_color : '#EDEDED'} onChange={(e) => setForm({ ...form, app_bg_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Warna Latar Aplikasi</p>
                        <input type="text" value={(form as unknown as { app_bg_color?: string }).app_bg_color || '#EDEDED'} onChange={(e) => setForm({ ...form, app_bg_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="w-full bg-transparent font-mono text-xs font-bold text-primary-900 outline-none dark:text-white" maxLength={7} placeholder="#EDEDED" />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/65">Body &amp; dashboard `--c-app-bg`.</p>
                    <div className="mt-2 rounded-lg border border-dashed border-primary-900/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Gradasi Latar — {getGrad('app_bg').length} tambahan</p>
                        <button type="button" onClick={() => addGrad('app_bg')} disabled={getGrad('app_bg').length >= 8} className="inline-flex items-center gap-1 rounded-full bg-primary-900 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-primary-900"><Plus className="h-3 w-3" /> Tambah</button>
                      </div>
                      {getGrad('app_bg').length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {getGrad('app_bg').map((c, i) => (
                            <div key={`ab-${i}`} className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2 py-1 dark:border-white/10 dark:bg-primary-900">
                              <input type="color" value={c} onChange={(e) => updateGrad('app_bg', i, e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={c} onChange={(e) => updateGrad('app_bg', i, e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold text-primary-900 outline-none dark:text-white" maxLength={7} />
                              <button type="button" onClick={() => removeGrad('app_bg', i)} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <div className="h-6 w-full rounded-full border border-black/5" style={{ background: buildPreview(effectiveAppBg, 'app_bg') }} />
                        </div>
                      )}
                      {getGrad('app_bg').length === 0 && <p className="mt-1.5 font-mono text-[10px] text-[#8A9AA0]">Tambah untuk gradient latar.</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary-900/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label="Warna Splash" value={/^#[0-9a-fA-F]{6}$/.test((form as unknown as { splash_bg_color?: string }).splash_bg_color ?? '') ? (form as unknown as { splash_bg_color: string }).splash_bg_color : '#064247'} onChange={(e) => setForm({ ...form, splash_bg_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Warna Splash Screen</p>
                        <input type="text" value={(form as unknown as { splash_bg_color?: string }).splash_bg_color || '#064247'} onChange={(e) => setForm({ ...form, splash_bg_color: e.target.value, theme_preset: 'custom' } as unknown as SchoolSettings)} className="w-full bg-transparent font-mono text-xs font-bold text-primary-900 outline-none dark:text-white" maxLength={7} placeholder="#064247" />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/65">Splash `--c-splash-bg`.</p>
                    <div className="mt-2 rounded-lg border border-dashed border-primary-900/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Gradasi Splash — {getGrad('splash').length} tambahan</p>
                        <button type="button" onClick={() => addGrad('splash')} disabled={getGrad('splash').length >= 8} className="inline-flex items-center gap-1 rounded-full bg-primary-900 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-primary-900"><Plus className="h-3 w-3" /> Tambah</button>
                      </div>
                      {getGrad('splash').length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {getGrad('splash').map((c, i) => (
                            <div key={`sp-${i}`} className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2 py-1 dark:border-white/10 dark:bg-primary-900">
                              <input type="color" value={c} onChange={(e) => updateGrad('splash', i, e.target.value)} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={c} onChange={(e) => updateGrad('splash', i, e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold text-primary-900 outline-none dark:text-white" maxLength={7} />
                              <button type="button" onClick={() => removeGrad('splash', i)} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                          <div className="h-6 w-full rounded-full border border-black/5" style={{ background: buildPreview(effectiveSplash, 'splash') }} />
                        </div>
                      )}
                      {getGrad('splash').length === 0 && <p className="mt-1.5 font-mono text-[10px] text-[#8A9AA0]">Tambah untuk gradient splash.</p>}
                    </div>
                  </div>
                </div>
                <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">Saran harmoni: {suggestSecondary(effectivePrimary)} dengan {effectivePrimary}. Tiap card bisa ditambah warna gradasi — preview di bawah &amp; permukaan langsung berubah.</p>
                <div className="rounded-xl border border-dashed border-black/10 bg-slate-50 p-3 dark:border-white/15 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">PALET GRADASI BEBAS — {effectiveExtras.length} WARNA TAMBAHAN</p>
                      <p className="mt-1 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/60">Tambahkan warna sebanyak-banyaknya. Semua warna di sini bergabung dengan Warna Utama &amp; Sekunder membentuk gradient tema (`--app-gradient`) yang dipakai di tombol &amp; header. Seret tidak perlu — urutan sesuai daftar.</p>
                    </div>
                    <button type="button" onClick={() => { if (effectiveExtras.length >= 12) return; const v = '#0D868F'; setForm({ ...form, extra_colors: [...effectiveExtras, v], theme_preset: 'custom' } as unknown as SchoolSettings) }} disabled={effectiveExtras.length >= 12} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-900/90 disabled:opacity-40 dark:bg-white dark:text-primary-900"><Plus className="h-3.5 w-3.5" /> Tambah</button>
                  </div>
                  {effectiveExtras.length === 0 ? (
                    <p className="mt-3 rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-[#8A9AA0] dark:bg-white/5">Belum ada warna tambahan — gradient hanya pakai Utama → Sekunder. Klik Tambah untuk memperkaya gradasi.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {effectiveExtras.map((c, idx) => (
                        <div key={`${c}-${idx}`} className="flex items-center gap-2 rounded-xl border border-primary-900/10 bg-white px-2.5 py-2 dark:border-white/10 dark:bg-primary-900">
                          <input type="color" aria-label={`Warna gradasi ${idx + 1}`} value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0D868F'} onChange={(e) => { const next = [...effectiveExtras]; next[idx] = e.target.value; setForm({ ...form, extra_colors: next, theme_preset: 'custom' } as unknown as SchoolSettings) }} className="h-8 w-9 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                          <input type="text" value={c} onChange={(e) => { const next = [...effectiveExtras]; next[idx] = e.target.value; setForm({ ...form, extra_colors: next, theme_preset: 'custom' } as unknown as SchoolSettings) }} className="min-w-0 flex-1 bg-transparent font-mono text-xs font-bold text-primary-900 outline-none dark:text-white" maxLength={7} placeholder="#0D868F" />
                          <button type="button" aria-label="Hapus warna" onClick={() => { const next = effectiveExtras.filter((_, i) => i !== idx); setForm({ ...form, extra_colors: next, theme_preset: 'custom' } as unknown as SchoolSettings) }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:bg-white/10 dark:text-white/60"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {effectivePalette.length > 2 && (
                    <div className="mt-3">
                      <p className="font-mono text-[10px] tracking-wide text-[#8A9AA0]">PRATINJAU GRADASI PALET ({effectivePalette.length} WARNA)</p>
                      <div className="mt-1.5 h-8 w-full rounded-xl border border-black/5" style={{ background: `linear-gradient(90deg, ${effectivePalette.join(', ')})` }} />
                      <p className="mt-1 font-mono text-[10px] text-[#8A9AA0]">{effectivePalette.join(' → ')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-primary-900/8 bg-white p-3 dark:border-white/10 dark:bg-primary-900">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">PRATINJAU — HEADER & TOMBOL</p>
                <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-white" style={{ background: effectivePalette.length > 1 ? `linear-gradient(135deg, ${effectivePalette.join(', ')})` : effectivePrimary }}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-xs font-black">CBT</span>
                  <span className="text-sm font-bold">Veyra CBT</span>
                  <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs font-bold" style={{ color: effectivePrimary }}>Masuk</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full" style={{ background: effectiveAppBg }}>
                  <div className="h-2 rounded-full" style={{ width: '62%', background: `linear-gradient(90deg, ${effectivePalette.join(', ')})` }} />
                </div>
                <p className="mt-2 font-mono text-[10px] text-[#8A9AA0]">{contrastOk ? 'Kontras aman ✓' : 'Kontras rendah — teks putih sulit dibaca'}</p>
                {effectivePalette.length > 2 && <p className="mt-1 font-mono text-[10px] text-[#8A9AA0]">Palet: {effectivePalette.join(' → ')}</p>}
              </div>
              <div className="rounded-xl border border-primary-900/8 bg-white p-3 dark:border-white/10 dark:bg-primary-900">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">GRADASI PALET LENGKAP</p>
                <div className="mt-2 h-10 w-full rounded-xl border border-black/5" style={{ background: effectivePalette.length > 1 ? `linear-gradient(135deg, ${effectivePalette.join(', ')})` : effectivePrimary }} />
                <p className="mt-2 font-mono text-[11px] text-[#6B7A7F] dark:text-white/60">{effectivePalette.join(' → ')}</p>
                <p className="mt-1 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/50">Dipakai di tombol gradient, header halus, dan aksen. Tambah warna di palet bebas untuk memperkaya.</p>
              </div>
              <div className="rounded-xl border border-primary-900/8 bg-white p-3 dark:border-white/10 dark:bg-primary-900">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">PRATINJAU — LATAR APLIKASI</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-black/5 p-3" style={{ background: buildPreview(effectiveAppBg, 'app_bg') }}>
                  <div className="flex gap-2">
                    <div className="h-12 w-12 rounded-lg border border-black/5 bg-white shadow-sm" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2 w-3/4 rounded bg-slate-200" />
                      <div className="h-2 w-full rounded bg-slate-100" />
                      <div className="h-2 w-2/3 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <span className="h-6 flex-1 rounded-full text-center font-mono text-[9px] leading-6 text-white" style={{ background: buildPreview(effectivePrimary, 'primary') }}>Primary</span>
                    <span className="h-6 flex-1 rounded-full border border-black/10 bg-white text-center font-mono text-[9px] leading-6 text-slate-600">Card</span>
                  </div>
                </div>
                <p className="mt-2 font-mono text-[11px] text-[#6B7A7F] dark:text-white/60">{buildPreview(effectiveAppBg, 'app_bg')}</p>
                <p className="mt-1 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/50">Body &amp; dashboard `--c-app-bg` / `--c-app-gradient`. Tambah gradasi di card Latar untuk gradient.</p>
              </div>
              <div className="rounded-xl border border-primary-900/8 bg-white p-3 dark:border-white/10 dark:bg-primary-900">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">PRATINJAU — SPLASH SCREEN</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-white/10 p-3" style={{ background: buildPreview(effectiveSplash, 'splash') }}>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: effectivePrimary }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: effectiveSecondary }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: effectivePrimary }} />
                  </div>
                  <div className="mt-2 flex justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[10px] font-black" style={{ color: effectiveSplash }}>CBT</span>
                  </div>
                  <p className="mt-2 text-center text-xs font-bold text-white">Veyra CBT</p>
                  <div className="mx-auto mt-1.5 h-1.5 w-24 rounded-full bg-white/15 p-0.5">
                    <div className="h-full w-2/5 rounded-full" style={{ background: `linear-gradient(90deg, ${effectivePrimary}, ${effectiveSecondary})` }} />
                  </div>
                </div>
                <p className="mt-2 font-mono text-[11px] text-[#6B7A7F] dark:text-white/60">{buildPreview(effectiveSplash, 'splash')}</p>
                <p className="mt-1 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/50">`--c-splash-bg` / `--c-splash-gradient`. Tambah di card Splash untuk gradient.</p>
              </div>
              <div className="rounded-xl border border-primary-900/8 bg-white p-3 dark:border-white/10 dark:bg-primary-900">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">PRATINJAU — LOGIN (PANEL KIRI)</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-white/10" style={{ background: buildPreview(effectiveLogin, 'login') }}>
                  <div className="flex items-center gap-2 px-3 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white p-1"><span className="h-3 w-3 rounded bg-slate-200" /></span>
                    <span className="text-xs font-bold text-white">Veyra CBT • RUANG UJIAN</span>
                  </div>
                  <div className="px-3 pb-3">
                    <p className="text-sm font-black leading-tight text-white">Ujian yang<br /><span className="text-white/60">terukur.</span></p>
                    <div className="mt-2 rounded-lg bg-white/10 px-2 py-1.5 backdrop-blur">
                      <p className="font-mono text-[9px] tracking-wide text-white/50">LEMBAR SOAL — PRATINJAU</p>
                      <p className="mt-1 text-[11px] text-white/75">Pilihan ganda — 4 opsi, 1 jawaban</p>
                    </div>
                  </div>
                </div>
                <p className="mt-2 font-mono text-[11px] text-[#6B7A7F] dark:text-white/60">{buildPreview(effectiveLogin, 'login')}</p>
                <p className="mt-1 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/50">`--c-login-bg` / `--c-login-gradient`. Tambah gradasi di card Login.</p>
              </div>
              <div className="rounded-xl border border-primary-900/8 bg-white p-3 dark:border-white/10 dark:bg-primary-900">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0]">PRATINJAU — SIDEBAR</p>
                <div className="mt-2 flex gap-2 overflow-hidden rounded-xl border border-white/10 p-2" style={{ background: buildPreview(effectiveSidebar, 'sidebar') }}>
                  <div className="flex w-16 flex-col gap-1.5 rounded-lg bg-white/10 p-2">
                    <span className="h-1.5 w-full rounded bg-white/40" />
                    <span className="h-1.5 w-3/4 rounded bg-white" />
                    <span className="h-1.5 w-full rounded bg-white/20" />
                    <span className="h-1.5 w-5/6 rounded bg-white/20" />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 py-1">
                    <span className="h-1.5 w-full rounded bg-white/15" />
                    <span className="h-1.5 w-2/3 rounded bg-white/10" />
                    <span className="mt-1 h-6 w-20 rounded-full bg-white text-center font-mono text-[9px] leading-6" style={{ color: effectiveSidebar }}>Aktif</span>
                  </div>
                </div>
                <p className="mt-2 font-mono text-[11px] text-[#6B7A7F] dark:text-white/60">{buildPreview(effectiveSidebar, 'sidebar')}</p>
                <p className="mt-1 text-[11px] leading-snug text-[#6B7A7F] dark:text-white/50">`--c-sidebar-bg` / `--c-sidebar-gradient`. Tambah di card Sidebar.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="label-base">Logo Aplikasi</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <img src={sanitizeLogoUrl(form.logo_url) ? resolveLogoUrl(form.logo_url) : getDefaultLogo()} alt="Logo" className="h-20 w-20 rounded-xl border border-slate-200 bg-white object-contain p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900" width={80} height={80} onError={(e)=>{ const t=e.currentTarget; const fb=getDefaultLogo(); if(t.src === fb || t.src.endsWith(fb)) return; t.onerror=null; t.src=fb }} />
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

function DangerPanel() {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [wipeAllConfirm, setWipeAllConfirm] = useState('')

  const run = async (key: string, fn: () => Promise<unknown>, label: string) => {
    const ok = await confirm.confirm({
      title: `Hapus ${label}?`,
      message: `Data ${label} akan dihapus permanen dari database dan tidak bisa dipulihkan. Lanjutkan?`,
      danger: true,
      confirmText: 'Hapus Permanen',
    })
    if (!ok) return
    setBusy(key)
    try {
      await fn()
      toast.success(`${label} berhasil dihapus permanen.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Gagal menghapus ${label}`)
    } finally {
      setBusy(null)
    }
  }

  const wipeAll = async (includeAdmin: boolean) => {
    const expected = includeAdmin ? 'HAPUS SEMUA' : 'HAPUS'
    const input = includeAdmin ? wipeAllConfirm : confirmText
    if (input.trim() !== expected) {
      toast.error(`Ketik "${expected}" untuk konfirmasi.`)
      return
    }
    const label = includeAdmin ? 'SEMUA DATA termasuk admin' : 'SEMUA DATA (kecuali akun Anda)'
    const ok = await confirm.confirm({
      title: `Hapus ${label}?`,
      message: `Ini akan menghapus ${label} secara permanen. Aksi tidak bisa dibatalkan.`,
      danger: true,
      confirmText: 'Ya, Hapus Semua',
    })
    if (!ok) return
    setBusy(includeAdmin ? 'wipeAllAdmin' : 'wipeAll')
    try {
      const mod = await import('@/services/danger.service')
      if (includeAdmin) {
        await mod.wipeAllIncludingAdmin()
        toast.success('Semua data termasuk admin dihapus. Anda akan diarahkan ke wizard setup.')
        setTimeout(() => { window.location.href = `${import.meta.env.BASE_URL}setup` }, 1200)
      } else {
        const { data: { user } } = await (await import('@/services/client')).supabase.auth.getUser()
        await mod.wipeAll(user?.id)
        toast.success('Semua data berhasil dihapus (akun Anda tetap).')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal wipe')
    } finally {
      setBusy(null)
    }
  }

  const items: { key: string; label: string; desc: string; fn: () => Promise<unknown> }[] = [
    { key: 'students', label: 'Siswa + Akun', desc: 'Hapus semua siswa, nilai, attempt & akun login siswa', fn: async () => (await import('@/services/danger.service')).wipeStudents() },
    { key: 'teachers', label: 'Guru + Akun', desc: 'Hapus semua guru & akun (kecuali Anda) beserta jadwalnya', fn: async () => { const { supabase } = await import('@/services/client'); const { data: { user } } = await supabase.auth.getUser(); return (await import('@/services/danger.service')).wipeTeachers(user?.id) } },
    { key: 'classes', label: 'Kelas', desc: 'Hapus semua kelas beserta jadwal kelas tersebut', fn: async () => (await import('@/services/danger.service')).wipeClasses() },
    { key: 'departments', label: 'Jurusan', desc: 'Hapus semua jurusan, kelas & jadwal terkait', fn: async () => (await import('@/services/danger.service')).wipeDepartments() },
    { key: 'banks', label: 'Bank Soal', desc: 'Hapus semua bank, soal, ujian & nilai terkait', fn: async () => (await import('@/services/danger.service')).wipeBanks() },
    { key: 'exams', label: 'Ujian', desc: 'Hapus semua ujian, jadwal, peserta & nilai', fn: async () => (await import('@/services/danger.service')).wipeExams() },
    { key: 'schedules', label: 'Jadwal', desc: 'Hapus semua jadwal pelajaran', fn: async () => (await import('@/services/danger.service')).wipeSchedules() },
    { key: 'results', label: 'Hasil Ujian', desc: 'Hapus attempts & nilai', fn: async () => (await import('@/services/danger.service')).wipeResults() },
    { key: 'violations', label: 'Pelanggaran', desc: 'Hapus log pelanggaran & keamanan', fn: async () => (await import('@/services/danger.service')).wipeViolations() },
    { key: 'audit', label: 'Audit Log', desc: 'Hapus jejak audit', fn: async () => (await import('@/services/danger.service')).wipeAudit() },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border-2 border-rose-200 bg-rose-50 p-5 dark:border-rose-900/40 dark:bg-rose-950/30">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-black tracking-tight text-rose-900 dark:text-rose-100">Zona Bahaya — Hapus Permanen</h3>
            <p className="mt-1 text-xs leading-relaxed text-rose-700 dark:text-rose-300">Setiap tombol di bawah akan menghapus dari <strong>database</strong> (hard delete) sehingga username/NIS/NIP bisa dipakai lagi. Tidak ada sampah soft-delete.</p>
            <p className="mt-2 font-mono text-[11px] text-rose-600 dark:text-rose-400">Gunakan dengan hati-hati. Tidak bisa di-undo.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div key={it.key} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{it.label}</p>
              <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{it.desc}</p>
            </div>
            <Button size="sm" variant="outline" className="mt-3 w-full border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300" loading={busy === it.key} icon={<Trash2 className="h-4 w-4" />} onClick={() => void run(it.key, it.fn, it.label)}>Hapus {it.label}</Button>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2 text-rose-700 dark:text-rose-300"><Skull className="h-4 w-4" /> Wipe Total</span>} subtitle="Hapus banyak tabel sekaligus. Pilih yang Anda butuhkan." />
        <CardBody className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-100">Hapus SEMUA DATA (kecuali akun Anda)</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">Akan menghapus tanpa terkecuali: hasil, ujian, jadwal, bank soal, soal, kelas, jurusan, mapel, guru, siswa, pelanggaran, keamanan, audit, notifikasi, media. Akun admin yang sedang login tetap.</p>
            <div className="mt-3 flex gap-2">
              <Input placeholder='Ketik HAPUS untuk konfirmasi' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="flex-1" />
              <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" loading={busy === 'wipeAll'} onClick={() => void wipeAll(false)} icon={<Trash2 className="h-4 w-4" />}>Hapus Semua</Button>
            </div>
          </div>
          <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
            <p className="flex items-center gap-2 text-xs font-black tracking-wide text-rose-800 dark:text-rose-200"><Skull className="h-4 w-4" /> HAPUS SEMUA TERMASUK AKUN ADMIN</p>
            <p className="mt-1 text-xs leading-relaxed text-rose-700 dark:text-rose-300">Termasuk akun admin yang sedang login. Setelah ini Anda akan logout dan harus buat admin baru via <code className="rounded bg-white px-1">/setup</code>.</p>
            <div className="mt-3 flex gap-2">
              <Input placeholder='Ketik HAPUS SEMUA' value={wipeAllConfirm} onChange={(e) => setWipeAllConfirm(e.target.value)} className="flex-1" />
              <Button variant="danger" loading={busy === 'wipeAllAdmin'} onClick={() => void wipeAll(true)} icon={<Skull className="h-4 w-4" />}>Hapus Total</Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
